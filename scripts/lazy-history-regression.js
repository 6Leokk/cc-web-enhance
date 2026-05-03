#!/usr/bin/env node

const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const { spawn } = require('child_process');
const WebSocket = require('ws');

const REPO_DIR = path.resolve(__dirname, '..');
const SERVER_PATH = path.join(REPO_DIR, 'server.js');
const APP_JS_PATH = path.join(REPO_DIR, 'public', 'app.js');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function mkdirp(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      server.close(() => resolve(addr.port));
    });
  });
}

async function waitForPort(port, timeoutMs = 10000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const connected = await new Promise((resolve) => {
      const socket = net.createConnection({ host: '127.0.0.1', port }, () => {
        socket.destroy();
        resolve(true);
      });
      socket.on('error', () => resolve(false));
      socket.setTimeout(250, () => {
        socket.destroy();
        resolve(false);
      });
    });
    if (connected) return;
    await sleep(100);
  }
  throw new Error(`Timed out waiting for port ${port}`);
}

async function withServer(env, fn) {
  const child = spawn(process.execPath, [SERVER_PATH], {
    cwd: REPO_DIR,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
  child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
  try {
    await waitForPort(Number(env.PORT));
    await fn({ stdout: () => stdout, stderr: () => stderr });
  } finally {
    child.kill('SIGTERM');
    await sleep(300);
    if (child.exitCode === null) child.kill('SIGKILL');
  }
}

function connectWs(port, password) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    const messages = [];
    ws.on('open', () => ws.send(JSON.stringify({ type: 'auth', password })));
    ws.on('message', (buf) => {
      const msg = JSON.parse(String(buf));
      messages.push(msg);
      if (msg.type === 'auth_result' && msg.success) resolve({ ws, messages });
      if (msg.type === 'auth_result' && !msg.success) reject(new Error('Auth failed'));
    });
    ws.on('error', reject);
  });
}

function nextMessage(messages, ws, predicate, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const timer = setInterval(() => {
      const idx = messages.findIndex(predicate);
      if (idx !== -1) {
        clearInterval(timer);
        resolve(messages.splice(idx, 1)[0]);
        return;
      }
      if (Date.now() - started > timeoutMs) {
        clearInterval(timer);
        reject(new Error(`Timed out waiting for WebSocket message; state=${ws.readyState}`));
      }
    }, 50);
  });
}

async function assertNoMessage(messages, predicate, timeoutMs = 350) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const idx = messages.findIndex(predicate);
    if (idx !== -1) {
      throw new Error(`Expected no matching message, got ${JSON.stringify(messages[idx])}`);
    }
    await sleep(25);
  }
}

function buildLargeSession(sessionId, count = 50) {
  const messages = [];
  for (let i = 0; i < count; i++) {
    messages.push({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `${i % 2 === 0 ? 'User' : 'Assistant'} message ${i + 1}`,
      attachments: [],
      timestamp: new Date(Date.now() - (count - i) * 1000).toISOString(),
    });
  }
  return {
    id: sessionId,
    title: 'Lazy History Seed',
    created: new Date(Date.now() - 60000).toISOString(),
    updated: new Date().toISOString(),
    agent: 'codex',
    claudeSessionId: null,
    codexThreadId: null,
    model: 'gpt-5.4',
    permissionMode: 'yolo',
    totalCost: 0,
    totalUsage: { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 },
    messages,
  };
}

async function main() {
  const appJs = fs.readFileSync(APP_JS_PATH, 'utf8');
  const serverJs = fs.readFileSync(SERVER_PATH, 'utf8');

  assert(
    /load_session_history_chunk/.test(appJs),
    'frontend should define a load_session_history_chunk path for on-demand older history requests',
  );
  assert(
    /case 'load_session_history_chunk'/.test(serverJs),
    'server should handle load_session_history_chunk websocket messages',
  );

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-web-lazy-history-'));
  const configDir = path.join(tempRoot, 'config');
  const sessionsDir = path.join(tempRoot, 'sessions');
  const logsDir = path.join(tempRoot, 'logs');
  mkdirp(configDir);
  mkdirp(sessionsDir);
  mkdirp(logsDir);

  fs.writeFileSync(path.join(configDir, 'notify.json'), JSON.stringify({
    provider: 'off',
    summary: { enabled: false, trigger: 'background' },
  }, null, 2));

  const sessionId = 'lazy-history-session';
  fs.writeFileSync(path.join(sessionsDir, `${sessionId}.json`), JSON.stringify(buildLargeSession(sessionId), null, 2));

  const password = 'LazyHistory!234';
  const port = await getFreePort();

  await withServer({
    PORT: String(port),
    HOST: '127.0.0.1',
    CC_WEB_PASSWORD: password,
    CC_WEB_CONFIG_DIR: configDir,
    CC_WEB_SESSIONS_DIR: sessionsDir,
    CC_WEB_LOGS_DIR: logsDir,
  }, async () => {
    const client = await connectWs(port, password);
    await nextMessage(client.messages, client.ws, (msg) => msg.type === 'session_list');

    client.ws.send(JSON.stringify({ type: 'load_session', sessionId, requestId: 'lazy-load-1' }));
    const sessionInfo = await nextMessage(client.messages, client.ws, (msg) => (
      msg.type === 'session_info' &&
      msg.sessionId === sessionId &&
      msg.requestId === 'lazy-load-1'
    ));

    assert(Array.isArray(sessionInfo.messages) && sessionInfo.messages.length === 12, `Expected initial lazy load to return only 12 recent messages, got ${JSON.stringify(sessionInfo.messages)}`);
    assert(sessionInfo.historyTotal === 50, `Expected historyTotal=50, got ${JSON.stringify(sessionInfo)}`);
    assert(sessionInfo.historyBuffered === 12, `Expected historyBuffered=12, got ${JSON.stringify(sessionInfo)}`);
    assert(sessionInfo.historyCursor === 38, `Expected historyCursor=38, got ${JSON.stringify(sessionInfo)}`);

    await assertNoMessage(
      client.messages,
      (msg) => msg.type === 'session_history_chunk' && msg.sessionId === sessionId,
    );

    client.ws.send(JSON.stringify({
      type: 'load_session_history_chunk',
      sessionId,
      requestId: 'lazy-older-1',
      historyCursor: sessionInfo.historyCursor,
    }));
    const firstChunk = await nextMessage(client.messages, client.ws, (msg) => (
      msg.type === 'session_history_chunk' &&
      msg.sessionId === sessionId &&
      msg.requestId === 'lazy-older-1'
    ));
    assert(firstChunk.messages.length === 24, `Expected first on-demand history chunk to contain 24 messages, got ${JSON.stringify(firstChunk)}`);
    assert(firstChunk.historyCursor === 14, `Expected first on-demand history chunk to advance cursor to 14, got ${JSON.stringify(firstChunk)}`);
    assert(firstChunk.historyBuffered === 36, `Expected first on-demand history chunk to buffer 36 messages total, got ${JSON.stringify(firstChunk)}`);
    assert(firstChunk.remaining === 1, `Expected one remaining chunk after first on-demand history load, got ${JSON.stringify(firstChunk)}`);

    client.ws.send(JSON.stringify({
      type: 'load_session_history_chunk',
      sessionId,
      requestId: 'lazy-older-2',
      historyCursor: firstChunk.historyCursor,
    }));
    const secondChunk = await nextMessage(client.messages, client.ws, (msg) => (
      msg.type === 'session_history_chunk' &&
      msg.sessionId === sessionId &&
      msg.requestId === 'lazy-older-2'
    ));
    assert(secondChunk.messages.length === 14, `Expected second on-demand history chunk to contain 14 messages, got ${JSON.stringify(secondChunk)}`);
    assert(secondChunk.historyCursor === 0, `Expected second on-demand history chunk to exhaust cursor, got ${JSON.stringify(secondChunk)}`);
    assert(secondChunk.historyBuffered === 50, `Expected second on-demand history chunk to buffer all 50 messages, got ${JSON.stringify(secondChunk)}`);
    assert(secondChunk.remaining === 0, `Expected no remaining chunks after second on-demand history load, got ${JSON.stringify(secondChunk)}`);

    client.ws.close();
  });

  console.log('lazy history regression passed');
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});
