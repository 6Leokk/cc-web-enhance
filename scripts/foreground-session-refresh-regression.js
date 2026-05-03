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
      if (msg.type === 'auth_result' && msg.success) resolve({ ws, messages, token: msg.token });
      if (msg.type === 'auth_result' && !msg.success) reject(new Error('Auth failed'));
    });
    ws.on('error', reject);
  });
}

function nextMessage(messages, ws, predicate, timeoutMs = 15000) {
  const callSite = (() => {
    const stack = String(new Error().stack || '').split('\n');
    return (stack[3] || stack[2] || '').trim();
  })();
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
        const pendingTypes = messages.slice(0, 12).map((m) => m?.type).join(', ');
        const recentTypes = messages.slice(-12).map((m) => m?.type).join(', ');
        reject(new Error(`Timed out waiting for WebSocket message (state=${ws.readyState}, callSite=${callSite}, pendingTypes=[${pendingTypes}], recentTypes=[${recentTypes}])`));
      }
    }, 50);
  });
}

function writeSlowMockCodex(filePath) {
  const source = `#!/usr/bin/env node
const crypto = require('crypto');

function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => resolve(data));
  });
}

(async function main() {
  const args = process.argv.slice(2);
  const input = (await readStdin()).trim();
  const threadId = 'slow-mock-' + crypto.randomUUID();

  process.stdout.write(JSON.stringify({ type: 'thread.started', thread_id: threadId }) + '\\n');
  process.stdout.write(JSON.stringify({ type: 'turn.started' }) + '\\n');

  await new Promise((resolve) => setTimeout(resolve, 900));

  process.stdout.write(JSON.stringify({
    type: 'item.completed',
    item: {
      id: 'item_msg',
      type: 'agent_message',
      text: 'Slow mock handled: ' + input,
    },
  }) + '\\n');

  process.stdout.write(JSON.stringify({
    type: 'turn.completed',
    usage: { input_tokens: 10, cached_input_tokens: 2, output_tokens: 5 },
  }) + '\\n');
})();`;
  fs.writeFileSync(filePath, source, { mode: 0o755 });
}

function buildLargeSession(sessionId) {
  const messages = [];
  for (let i = 0; i < 20; i++) {
    messages.push({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `${i % 2 === 0 ? 'User' : 'Assistant'} message ${i + 1}`,
      attachments: [],
      timestamp: new Date(Date.now() - (20 - i) * 1000).toISOString(),
    });
  }
  return {
    id: sessionId,
    title: 'Foreground Refresh Seed',
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
  const visibilityStart = appJs.indexOf("document.addEventListener('visibilitychange'");
  const visibilityEnd = appJs.indexOf("window.addEventListener('pagehide'", visibilityStart);
  const visibilityHandler = visibilityStart >= 0 && visibilityEnd > visibilityStart
    ? [appJs.slice(visibilityStart, visibilityEnd)]
    : null;

  assert(visibilityHandler, 'visibilitychange handler is missing');
  assert(
    !/send\(\{\s*type:\s*'load_session',\s*sessionId:\s*currentSessionId\s*}\)/.test(visibilityHandler[0]),
    'foreground running-session refresh must not send a naked load_session request',
  );
  assert(
    /openSession\(currentSessionId,\s*\{[\s\S]*forceSync:\s*true[\s\S]*blocking:\s*false/.test(visibilityHandler[0]),
    'foreground running-session refresh should route through openSession(forceSync=true, blocking=false)',
  );

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-web-foreground-refresh-'));
  const configDir = path.join(tempRoot, 'config');
  const sessionsDir = path.join(tempRoot, 'sessions');
  const logsDir = path.join(tempRoot, 'logs');
  const homeDir = path.join(tempRoot, 'home');
  const slowMockPath = path.join(tempRoot, 'mock-codex-slow.js');
  mkdirp(configDir);
  mkdirp(sessionsDir);
  mkdirp(logsDir);
  mkdirp(homeDir);
  writeSlowMockCodex(slowMockPath);

  const sessionId = 'foreground-refresh-session';
  fs.writeFileSync(path.join(sessionsDir, sessionId + '.json'), JSON.stringify(buildLargeSession(sessionId), null, 2));
  fs.writeFileSync(path.join(configDir, 'notify.json'), JSON.stringify({ provider: 'off', summary: { enabled: false, trigger: 'background' } }, null, 2));
  fs.writeFileSync(path.join(configDir, 'ui.json'), JSON.stringify({ assistantMessageMode: 'segmented' }, null, 2));

  const password = 'ForegroundRefresh!234';
  const port = await getFreePort();

  await withServer({
    PORT: String(port),
    HOST: '127.0.0.1',
    CC_WEB_PASSWORD: password,
    CC_WEB_CONFIG_DIR: configDir,
    CC_WEB_SESSIONS_DIR: sessionsDir,
    CC_WEB_LOGS_DIR: logsDir,
    HOME: homeDir,
    USERPROFILE: homeDir,
    CODEX_PATH: slowMockPath,
  }, async () => {
    const client = await connectWs(port, password);
    await nextMessage(client.messages, client.ws, (msg) => msg.type === 'session_list');

    client.ws.send(JSON.stringify({ type: 'load_session', sessionId, requestId: 'prime-load' }));
    const primeInfo = await nextMessage(client.messages, client.ws, (msg) => msg.type === 'session_info' && msg.sessionId === sessionId && msg.requestId === 'prime-load');
    assert(primeInfo.historyCursor > 0, `prime load should expose lazy history cursor, got ${JSON.stringify(primeInfo)}`);
    await assertNoMessage(client.messages, (msg) => msg.type === 'session_history_chunk' && msg.sessionId === sessionId);
    client.ws.send(JSON.stringify({
      type: 'load_session_history_chunk',
      sessionId,
      requestId: 'prime-history-1',
      historyCursor: primeInfo.historyCursor,
    }));
    await nextMessage(client.messages, client.ws, (msg) => msg.type === 'session_history_chunk' && msg.sessionId === sessionId && msg.requestId === 'prime-history-1');

    client.ws.send(JSON.stringify({
      type: 'message',
      sessionId,
      agent: 'codex',
      mode: 'yolo',
      text: 'foreground refresh running-session probe',
    }));

    await nextMessage(client.messages, client.ws, (msg) => (
      msg.type === 'session_list' &&
      msg.sessions.some((session) => session.id === sessionId && session.isRunning)
    ));

    client.ws.send(JSON.stringify({ type: 'load_session', sessionId, requestId: 'foreground-refresh-1' }));
    const sessionInfo = await nextMessage(client.messages, client.ws, (msg) => (
      msg.type === 'session_info' &&
      msg.sessionId === sessionId &&
      msg.requestId === 'foreground-refresh-1'
    ));
    assert(sessionInfo.requestId === 'foreground-refresh-1', 'foreground refresh session_info should echo the owned requestId');
    await assertNoMessage(client.messages, (msg) => msg.type === 'session_history_chunk' && msg.sessionId === sessionId);
    client.ws.send(JSON.stringify({
      type: 'load_session_history_chunk',
      sessionId,
      requestId: 'foreground-refresh-history-1',
      historyCursor: sessionInfo.historyCursor,
    }));
    const historyChunk = await nextMessage(client.messages, client.ws, (msg) => (
      msg.type === 'session_history_chunk' &&
      msg.sessionId === sessionId &&
      msg.requestId === 'foreground-refresh-history-1'
    ));
    assert(historyChunk.requestId === 'foreground-refresh-history-1', 'foreground refresh on-demand history chunk should echo the owned requestId');

    client.ws.close();
  });

  console.log('foreground session refresh regression passed');
}

main().catch((error) => {
  console.error(error.stack || error.message || String(error));
  process.exit(1);
});
