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
const APP_JS_PATH = path.join(REPO_DIR, 'public', 'app.js');

function mkdirp(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function runNotifyUiChecks() {
  const appJs = fs.readFileSync(APP_JS_PATH, 'utf8');
  assert(appJs.includes('id="notify-trigger"'), 'notification trigger select should be visible in main notify settings');
  assert(appJs.includes('网页前台也通知'), 'foreground notification option label is missing');
  assert(!appJs.includes('id="notify-summary-trigger"'), 'notification trigger should not be hidden under AI summary settings');
  assert(appJs.includes("panel.querySelector('#notify-trigger')"), 'notify config collector should read the main trigger select');
  assert(/trigger:\s*notifyTrigger\s*\?\s*notifyTrigger\.value/.test(appJs), 'notify trigger should be saved from the main trigger select');
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
    await waitForPort(env.PORT);
    await fn({ stdout: () => stdout, stderr: () => stderr });
  } finally {
    child.kill('SIGTERM');
    await sleep(300);
    if (!child.killed) child.kill('SIGKILL');
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
  runNotifyUiChecks();

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-web-notify-regression-'));
  const configDir = path.join(tempRoot, 'config');
  const sessionsDir = path.join(tempRoot, 'sessions');
  const logsDir = path.join(tempRoot, 'logs');
  const homeDir = path.join(tempRoot, 'home');
  mkdirp(configDir);
  mkdirp(sessionsDir);
  mkdirp(logsDir);
  mkdirp(homeDir);

  const port = await getFreePort();
  const password = 'Notify!234';

  await withCaptureServer(async ({ baseUrl, requests }) => {
    await withServer({
      PORT: String(port),
      CC_WEB_PASSWORD: password,
      CC_WEB_CONFIG_DIR: configDir,
      CC_WEB_SESSIONS_DIR: sessionsDir,
      CC_WEB_LOGS_DIR: logsDir,
      HOME: homeDir,
      USERPROFILE: homeDir,
    }, async () => {
      const { ws, messages } = await connectWs(port, password);
      await nextMessage(messages, ws, (msg) => msg.type === 'session_list');

      ws.send(JSON.stringify({
        type: 'save_notify_config',
        config: {
          provider: 'bark',
          bark: {
            serverUrl: baseUrl,
            deviceKey: 'bark-regression-key',
            group: 'CC-Web Regression',
            sound: 'bell',
            level: 'timeSensitive',
            icon: 'https://example.com/icon.png',
            url: 'https://example.com/open',
          },
          summary: {
            enabled: true,
            trigger: 'always',
            apiSource: 'custom',
            apiBase: baseUrl,
            apiKey: 'sk-summary-regression',
            model: 'summary-model',
          },
        },
      }));

      const notifyConfigMsg = await nextMessage(messages, ws, (msg) => msg.type === 'notify_config');
      assert(notifyConfigMsg.config.provider === 'bark', 'Bark provider save/load failed');
      assert(notifyConfigMsg.config.bark?.serverUrl === baseUrl, 'Bark server URL save/load failed');
      assert(notifyConfigMsg.config.bark?.deviceKey.includes('****'), 'Bark device key should be masked');
      assert(notifyConfigMsg.config.bark?.group === 'CC-Web Regression', 'Bark group save/load failed');
      assert(notifyConfigMsg.config.bark?.sound === 'bell', 'Bark sound save/load failed');
      assert(notifyConfigMsg.config.bark?.level === 'timeSensitive', 'Bark level save/load failed');
      assert(notifyConfigMsg.config.bark?.icon === 'https://example.com/icon.png', 'Bark icon save/load failed');
      assert(notifyConfigMsg.config.bark?.url === 'https://example.com/open', 'Bark URL save/load failed');

      ws.send(JSON.stringify({ type: 'test_notify' }));
      const testResult = await nextMessage(messages, ws, (msg) => msg.type === 'notify_test_result');
      assert(testResult.success === true, `Bark test notification failed: ${testResult.message}`);
      assert(requests.length === 1, 'Bark test notification should send one HTTP request');
      assert(requests[0].method === 'POST', 'Bark notification should use POST');
      assert(requests[0].url === '/bark-regression-key', 'Bark notification should post to /{deviceKey}');
      const barkPayload = JSON.parse(requests[0].body);
      assert(barkPayload.title === 'CC-Web 测试通知', 'Bark payload title mismatch');
      assert(barkPayload.body === '这是一条测试消息，如果你收到了说明通知配置正确！', 'Bark payload body mismatch');
      assert(barkPayload.group === 'CC-Web Regression', 'Bark payload group mismatch');
      assert(barkPayload.level === 'timeSensitive', 'Bark payload level mismatch');
      assert(barkPayload.sound === 'bell', 'Bark payload sound mismatch');
      assert(barkPayload.icon === 'https://example.com/icon.png', 'Bark payload icon mismatch');
      assert(barkPayload.url === 'https://example.com/open', 'Bark payload url mismatch');

      ws.send(JSON.stringify({
        type: 'save_notify_config',
        config: {
          provider: 'bark',
          bark: {
            serverUrl: 'https://self-hosted.example.com',
            deviceKey: notifyConfigMsg.config.bark.deviceKey,
            group: 'CC-Web',
            level: 'active',
          },
          summary: notifyConfigMsg.config.summary,
        },
      }));
      await nextMessage(messages, ws, (msg) => msg.type === 'notify_config');

      const stored = JSON.parse(fs.readFileSync(path.join(configDir, 'notify.json'), 'utf8'));
      assert(stored.bark?.deviceKey === 'bark-regression-key', 'Masked Bark device key should preserve stored secret');
      assert(stored.bark?.serverUrl === 'https://self-hosted.example.com', 'Bark server URL should update when saving masked key');
      assert(stored.bark?.group === 'CC-Web', 'Bark group should update when saving masked key');
      assert(stored.bark?.level === 'active', 'Bark level should update when saving masked key');

      ws.close();
    });
  });

  const envConfigDir = path.join(tempRoot, 'env-config');
  const envSessionsDir = path.join(tempRoot, 'env-sessions');
  const envLogsDir = path.join(tempRoot, 'env-logs');
  mkdirp(envConfigDir);
  mkdirp(envSessionsDir);
  mkdirp(envLogsDir);
  const envPort = await getFreePort();
  await withServer({
    PORT: String(envPort),
    CC_WEB_PASSWORD: password,
    CC_WEB_CONFIG_DIR: envConfigDir,
    CC_WEB_SESSIONS_DIR: envSessionsDir,
    CC_WEB_LOGS_DIR: envLogsDir,
    HOME: homeDir,
    USERPROFILE: homeDir,
    BARK_SERVER_URL: 'https://env-bark.example.com',
    BARK_DEVICE_KEY: 'env-bark-key',
    BARK_GROUP: 'Env Group',
    BARK_SOUND: 'bell',
    BARK_LEVEL: 'passive',
    BARK_ICON: 'https://example.com/env-icon.png',
    BARK_URL: 'https://example.com/env-open',
  }, async () => {
    const stored = JSON.parse(fs.readFileSync(path.join(envConfigDir, 'notify.json'), 'utf8'));
    assert(stored.provider === 'bark', 'Bark env should select Bark provider on first startup');
    assert(stored.bark?.serverUrl === 'https://env-bark.example.com', 'Bark env server URL migration failed');
    assert(stored.bark?.deviceKey === 'env-bark-key', 'Bark env device key migration failed');
    assert(stored.bark?.group === 'Env Group', 'Bark env group migration failed');
    assert(stored.bark?.sound === 'bell', 'Bark env sound migration failed');
    assert(stored.bark?.level === 'passive', 'Bark env level migration failed');
    assert(stored.bark?.icon === 'https://example.com/env-icon.png', 'Bark env icon migration failed');
    assert(stored.bark?.url === 'https://example.com/env-open', 'Bark env URL migration failed');
  });

  const hostConfigDir = path.join(tempRoot, 'host-config');
  const hostSessionsDir = path.join(tempRoot, 'host-sessions');
  const hostLogsDir = path.join(tempRoot, 'host-logs');
  mkdirp(hostConfigDir);
  mkdirp(hostSessionsDir);
  mkdirp(hostLogsDir);
  const hostPort = await getFreePort();
  await withServer({
    HOST: '127.0.0.1',
    PORT: String(hostPort),
    CC_WEB_PASSWORD: password,
    CC_WEB_CONFIG_DIR: hostConfigDir,
    CC_WEB_SESSIONS_DIR: hostSessionsDir,
    CC_WEB_LOGS_DIR: hostLogsDir,
    HOME: homeDir,
    USERPROFILE: homeDir,
  }, async ({ stdout }) => {
    assert(stdout().includes(`CC-Web server listening on 127.0.0.1:${hostPort}`), 'HOST env should control bind address');
    assert(!/LAN access: http:\/\//.test(stdout()), 'HOST=127.0.0.1 should not print LAN access URLs');
  });

  console.log('Notify regression checks passed.');
}

main().catch((err) => {
  console.error(err.stack || err.message);
  process.exit(1);
});
