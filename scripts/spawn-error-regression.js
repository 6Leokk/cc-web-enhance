#!/usr/bin/env node

const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const { spawn } = require('child_process');
const WebSocket = require('ws');

const REPO_DIR = path.resolve(__dirname, '..');
const SERVER_PATH = path.join(REPO_DIR, 'server.js');

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
    await fn({ child, stdout: () => stdout, stderr: () => stderr });
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
    ws.on('open', () => {
      ws.send(JSON.stringify({ type: 'auth', password }));
    });
    ws.on('message', (buf) => {
      const msg = JSON.parse(String(buf));
      messages.push(msg);
      if (msg.type === 'auth_result' && msg.success) resolve({ ws, messages });
      if (msg.type === 'auth_result' && !msg.success) reject(new Error('Auth failed'));
    });
    ws.on('error', reject);
  });
}

function nextMessage(messages, ws, predicate, timeoutMs = 10000) {
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

async function main() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-web-spawn-error-'));
  const configDir = path.join(tempRoot, 'config');
  const sessionsDir = path.join(tempRoot, 'sessions');
  const logsDir = path.join(tempRoot, 'logs');
  const homeDir = path.join(tempRoot, 'home');
  mkdirp(configDir);
  mkdirp(sessionsDir);
  mkdirp(logsDir);
  mkdirp(homeDir);

  fs.writeFileSync(path.join(configDir, 'notify.json'), JSON.stringify({
    provider: 'off',
    summary: { enabled: false, trigger: 'background' },
  }, null, 2));

  const port = await getFreePort();
  const password = 'SpawnError!234';
  const processLogPath = path.join(logsDir, 'process.log');

  await withServer({
    PORT: String(port),
    HOST: '127.0.0.1',
    CC_WEB_PASSWORD: password,
    CC_WEB_CONFIG_DIR: configDir,
    CC_WEB_SESSIONS_DIR: sessionsDir,
    CC_WEB_LOGS_DIR: logsDir,
    HOME: homeDir,
    USERPROFILE: homeDir,
    CODEX_PATH: 'codex-command-that-does-not-exist',
    CLAUDE_PATH: process.execPath,
  }, async ({ child }) => {
    const { ws, messages } = await connectWs(port, password);
    await nextMessage(messages, ws, (msg) => msg.type === 'session_list');

    ws.send(JSON.stringify({
      type: 'new_session',
      agent: 'codex',
      cwd: tempRoot,
      mode: 'yolo',
    }));
    const sessionInfo = await nextMessage(messages, ws, (msg) => msg.type === 'session_info' && msg.agent === 'codex');

    ws.send(JSON.stringify({
      type: 'message',
      text: 'spawn failure should stay recoverable',
      sessionId: sessionInfo.sessionId,
      mode: 'yolo',
      agent: 'codex',
    }));

    const errorMsg = await nextMessage(messages, ws, (msg) => msg.type === 'error');
    assert(
      /ENOENT|not found|spawn|Codex CLI|CLI 路径/i.test(String(errorMsg.message || '')),
      `Expected spawn failure to reach the client as an error message, got ${JSON.stringify(errorMsg)}`,
    );

    await sleep(400);
    assert(child.exitCode === null, `Expected server to stay alive after spawn ENOENT, got exitCode=${child.exitCode}`);

    ws.send(JSON.stringify({ type: 'list_sessions' }));
    const sessionList = await nextMessage(messages, ws, (msg) => msg.type === 'session_list');
    const failedSession = Array.isArray(sessionList.sessions)
      ? sessionList.sessions.find((item) => item.id === sessionInfo.sessionId)
      : null;
    assert(
      failedSession && failedSession.isRunning === false,
      `Expected failed spawn session to be marked not running, got ${JSON.stringify(sessionList)}`,
    );

    const processLog = fs.existsSync(processLogPath)
      ? fs.readFileSync(processLogPath, 'utf8')
      : '';
    assert(
      !/\"event\":\"uncaught_exception\"/.test(processLog),
      `spawn ENOENT should not hit process-level uncaught_exception, got log=${processLog}`,
    );

    ws.close();
  });

  console.log('spawn error regression passed');
}

main().catch((err) => {
  console.error(err.stack || err.message);
  process.exit(1);
});
