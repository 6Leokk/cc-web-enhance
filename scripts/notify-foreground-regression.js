#!/usr/bin/env node

const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const http = require('http');
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

function withCaptureServer(fn) {
  return new Promise((resolve, reject) => {
    const requests = [];
    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => { body += chunk.toString(); });
      req.on('end', () => {
        requests.push({ method: req.method, url: req.url, headers: req.headers, body });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ code: 200, message: 'success' }));
      });
    });
    server.on('error', reject);
    server.listen(0, '127.0.0.1', async () => {
      const addr = server.address();
      try {
        await fn({ baseUrl: `http://127.0.0.1:${addr.port}`, requests });
        server.close((err) => err ? reject(err) : resolve());
      } catch (err) {
        server.close(() => reject(err));
      }
    });
  });
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
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-web-notify-foreground-'));
  const configDir = path.join(tempRoot, 'config');
  const sessionsDir = path.join(tempRoot, 'sessions');
  const logsDir = path.join(tempRoot, 'logs');
  const homeDir = path.join(tempRoot, 'home');
  mkdirp(configDir);
  mkdirp(sessionsDir);
  mkdirp(logsDir);
  mkdirp(homeDir);

  const password = 'NotifyFg!234';
  const port = await getFreePort();

  await withCaptureServer(async ({ baseUrl, requests }) => {
    fs.writeFileSync(path.join(configDir, 'notify.json'), JSON.stringify({
      provider: 'bark',
      bark: {
        serverUrl: baseUrl,
        deviceKey: 'foreground-key',
        group: 'CC-Web Foreground',
        sound: 'glass',
        level: 'active',
        icon: '',
        url: '',
      },
      pushplus: { token: '' },
      telegram: { botToken: '', chatId: '' },
      serverchan: { sendKey: '' },
      feishu: { webhook: '' },
      qqbot: { qmsgKey: '' },
      summary: {
        enabled: false,
        trigger: 'always',
        apiSource: 'claude',
        apiBase: '',
        apiKey: '',
        model: '',
      },
    }, null, 2));

    await withServer({
      PORT: String(port),
      HOST: '127.0.0.1',
      CC_WEB_PASSWORD: password,
      CC_WEB_CONFIG_DIR: configDir,
      CC_WEB_SESSIONS_DIR: sessionsDir,
      CC_WEB_LOGS_DIR: logsDir,
      HOME: homeDir,
      USERPROFILE: homeDir,
      CODEX_PATH: MOCK_CODEX_PATH,
    }, async () => {
      const { ws, messages } = await connectWs(port, password);
      await nextMessage(messages, ws, (msg) => msg.type === 'session_list');

      ws.send(JSON.stringify({
        type: 'message',
        agent: 'codex',
        mode: 'yolo',
        text: 'foreground notify check',
      }));

      await nextMessage(messages, ws, (msg) => msg.type === 'done');
      await sleep(500);
      assert(requests.length === 1, `expected one foreground Bark request, got ${requests.length}`);
      assert(requests[0].method === 'POST', 'foreground Bark request should use POST');
      assert(requests[0].url === '/foreground-key', 'foreground Bark request should target /{deviceKey}');
      const payload = JSON.parse(requests[0].body);
      assert(payload.group === 'CC-Web Foreground', 'foreground Bark payload group mismatch');
      assert(payload.sound === 'glass', 'foreground Bark payload sound mismatch');
      assert(payload.title.includes('回复就绪') || payload.title.includes('任务完成'), 'foreground Bark title should describe completed work');
      assert(payload.body.includes('会话:'), 'foreground Bark payload should include fallback session content');
      ws.close();
    });
  });

  console.log('Foreground notify regression checks passed.');
}

main().catch((err) => {
  console.error(err.stack || err.message);
  process.exit(1);
});
