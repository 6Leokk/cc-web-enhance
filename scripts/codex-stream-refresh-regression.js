#!/usr/bin/env node

const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const { spawn } = require('child_process');
const WebSocket = require('ws');

const REPO_DIR = path.resolve(__dirname, '..');
const SERVER_PATH = path.join(REPO_DIR, 'server.js');
const MOCK_CODEX_PATH = path.join(REPO_DIR, 'scripts', 'mock-codex.js');

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

function assistantContents(messages) {
  return messages
    .filter((msg) => msg && msg.role === 'assistant')
    .map((msg) => String(msg.content || ''));
}

async function main() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-web-codex-stream-refresh-'));
  const configDir = path.join(tempRoot, 'config');
  const sessionsDir = path.join(tempRoot, 'sessions');
  const logsDir = path.join(tempRoot, 'logs');
  mkdirp(configDir);
  mkdirp(sessionsDir);
  mkdirp(logsDir);

  fs.writeFileSync(path.join(configDir, 'notify.json'), JSON.stringify({
    provider: 'off',
    pushplus: { token: '' },
    telegram: { botToken: '', chatId: '' },
    serverchan: { sendKey: '' },
    feishu: { webhook: '' },
    qqbot: { qmsgKey: '' },
    bark: {
      serverUrl: 'https://api.day.app',
      deviceKey: '',
      group: 'CC-Web',
      sound: '',
      level: 'active',
      icon: '',
      url: '',
    },
    summary: { enabled: false, trigger: 'background', apiSource: 'claude', apiBase: '', apiKey: '', model: '' },
  }, null, 2));
  fs.writeFileSync(path.join(configDir, 'ui.json'), JSON.stringify({ assistantMessageMode: 'segmented' }, null, 2));

  const password = 'StreamRefresh!234';
  const port = await getFreePort();

  await withServer({
    PORT: String(port),
    HOST: '127.0.0.1',
    CC_WEB_PASSWORD: password,
    CC_WEB_CONFIG_DIR: configDir,
    CC_WEB_SESSIONS_DIR: sessionsDir,
    CC_WEB_LOGS_DIR: logsDir,
    CODEX_PATH: MOCK_CODEX_PATH,
  }, async () => {
    const primary = await connectWs(port, password);
    await nextMessage(primary.messages, primary.ws, (msg) => msg.type === 'session_list');

    const observer = await connectWs(port, password);
    await nextMessage(observer.messages, observer.ws, (msg) => msg.type === 'session_list');

    const prompt = [
      'cc-web paragraph split probe.',
      '',
      'Second assistant paragraph from mock.',
      '',
      'Third assistant paragraph from mock.',
    ].join('\n');

    primary.ws.send(JSON.stringify({
      type: 'message',
      agent: 'codex',
      mode: 'yolo',
      text: prompt,
    }));

    const sessionInfo = await nextMessage(primary.messages, primary.ws, (msg) => msg.type === 'session_info' && msg.agent === 'codex');
    const sessionId = sessionInfo.sessionId;

    await nextMessage(primary.messages, primary.ws, (msg) => (
      msg.type === 'session_list'
      && msg.sessions.some((session) => session.id === sessionId && session.isRunning)
    ));

    const final = await nextMessage(primary.messages, primary.ws, (msg) => msg.type === 'assistant_messages_final' && msg.sessionId === sessionId);
    const finalContents = assistantContents(final.messages || []);
    assert(finalContents.length === 1, `assistant_messages_final should keep one markdown agent_message in one bubble, got ${JSON.stringify(finalContents)}`);
    assert(
      finalContents[0] === [
        'Codex mock handled (0 image): cc-web paragraph split probe.',
        '',
        'Second assistant paragraph from mock.',
        '',
        'Third assistant paragraph from mock.',
      ].join('\n'),
      `final markdown segment mismatch: ${JSON.stringify(finalContents)}`,
    );

    await nextMessage(primary.messages, primary.ws, (msg) => msg.type === 'done' && msg.sessionId === sessionId);

    const backgroundDone = await nextMessage(observer.messages, observer.ws, (msg) => msg.type === 'background_done' && msg.sessionId === sessionId);
    assert(backgroundDone.responseLen > 0, 'background_done should include a non-empty response length');

    observer.ws.send(JSON.stringify({ type: 'list_sessions' }));
    const completedList = await nextMessage(observer.messages, observer.ws, (msg) => (
      msg.type === 'session_list'
      && msg.sessions.some((session) => session.id === sessionId && !session.isRunning)
    ));
    const completedMeta = completedList.sessions.find((session) => session.id === sessionId);
    assert(completedMeta && completedMeta.updated, 'completed session metadata should include an updated timestamp');

    observer.ws.send(JSON.stringify({ type: 'load_session', sessionId, requestId: 'refresh-check' }));
    const reloaded = await nextMessage(observer.messages, observer.ws, (msg) => (
      msg.type === 'session_info'
      && msg.sessionId === sessionId
      && msg.requestId === 'refresh-check'
    ));
    const reloadedContents = assistantContents(reloaded.messages || []);
    assert(reloadedContents.length === 1, `load_session should return one saved markdown assistant message, got ${JSON.stringify(reloadedContents)}`);
    assert(reloadedContents[0].includes('Third assistant paragraph from mock.'), `load_session missed the final paragraph: ${JSON.stringify(reloadedContents)}`);

    const sessionPath = path.join(sessionsDir, `${sessionId}.json`);
    const stored = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
    const storedContents = assistantContents(stored.messages || []);
    assert(storedContents.length === 1, `stored session should contain one markdown assistant message, got ${JSON.stringify(storedContents)}`);
    assert(storedContents[0].includes('Third assistant paragraph from mock.'), `stored session missed the final paragraph: ${JSON.stringify(storedContents)}`);

    primary.ws.close();
    observer.ws.close();
  });

  console.log('codex stream refresh regression passed');
}

main().catch((err) => {
  console.error(err.stack || err.message);
  process.exit(1);
});
