#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const net = require('net');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const WebSocket = require('ws');

const REPO_DIR = path.resolve(__dirname, '..');
const SERVER_PATH = path.join(REPO_DIR, 'server.js');

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
    const probe = spawnSync('bash', ['-lc', `ss -tln | grep -q ':${port} '`], { encoding: 'utf8' });
    if (probe.status === 0) return;
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
    await waitForPort(Number(env.PORT || env.CC_WEB_PORT), 10000);
    await fn({ stdout: () => stdout, stderr: () => stderr });
  } finally {
    child.kill('SIGTERM');
    await sleep(300);
    if (!child.killed) child.kill('SIGKILL');
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
      if (msg.type === 'auth_result' && msg.success) resolve({ ws, messages, token: msg.token });
      if (msg.type === 'auth_result' && !msg.success) reject(new Error('Auth failed'));
    });
    ws.on('error', reject);
  });
}

function nextMessage(messages, ws, predicate, timeoutMs = 5000) {
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
        const recent = messages.slice(-12).map((m) => m.type).join(', ');
        reject(new Error(`Timed out waiting for WebSocket message; state=${ws.readyState}; recent=[${recent}]`));
      }
    }, 50);
  });
}

function postJson(port, pathname, payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload || {});
    const req = http.request({
      host: '127.0.0.1',
      port,
      method: 'POST',
      path: pathname,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk.toString(); });
      res.on('end', () => {
        let json = null;
        try { json = data ? JSON.parse(data) : null; } catch {}
        resolve({ statusCode: res.statusCode, headers: res.headers, json, body: data });
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function extractPairToken(url) {
  const parsed = new URL(url);
  assert.strictEqual(parsed.search, '', 'quick login link must not put token in query string');
  assert(parsed.hash.startsWith('#pair='), 'quick login link must use /#pair= fragment');
  return decodeURIComponent(parsed.hash.slice('#pair='.length));
}

async function main() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-web-access-http-ws-'));
  const configDir = path.join(tempRoot, 'config');
  const sessionsDir = path.join(tempRoot, 'sessions');
  const logsDir = path.join(tempRoot, 'logs');
  mkdirp(configDir);
  mkdirp(sessionsDir);
  mkdirp(logsDir);

  const password = 'Access!234';
  fs.writeFileSync(path.join(configDir, 'auth.json'), JSON.stringify({ password, mustChange: true }, null, 2));
  fs.writeFileSync(path.join(configDir, 'access.json'), JSON.stringify({
    mode: 'public',
    directScope: 'local',
    publicUrl: 'https://cc.example.com',
    ngrok: { authtoken: '', domain: '', basicAuth: '', autoStart: false },
    frp: { autoStart: false },
  }, null, 2));

  const port = await getFreePort();
  await withServer({
    PORT: String(port),
    CC_WEB_CONFIG_DIR: configDir,
    CC_WEB_SESSIONS_DIR: sessionsDir,
    CC_WEB_LOGS_DIR: logsDir,
  }, async () => {
    const { ws, messages } = await connectWs(port, password);
    await nextMessage(messages, ws, (msg) => msg.type === 'session_list');

    ws.send(JSON.stringify({ type: 'get_access_config' }));
    const accessConfig = await nextMessage(messages, ws, (msg) => msg.type === 'access_config');
    assert.strictEqual(accessConfig.config.mode, 'public', 'get_access_config should return saved access mode');
    assert.strictEqual(accessConfig.config.publicUrl, 'https://cc.example.com', 'public URL should be returned');
    assert(accessConfig.lockedFields && Array.isArray(accessConfig.lockedFields), 'access_config should include lockedFields');

    ws.send(JSON.stringify({ type: 'get_access_status' }));
    const statusMsg = await nextMessage(messages, ws, (msg) => msg.type === 'access_status');
    assert.strictEqual(statusMsg.status.mode, 'public', 'access status should report active mode');
    assert.deepStrictEqual(statusMsg.status.urls.public, ['https://cc.example.com'], 'access status should include canonical public URL');

    ws.send(JSON.stringify({
      type: 'save_access_config',
      config: { mode: 'public', publicUrl: 'https://cc.example.com/path?x=1#bad' },
    }));
    const invalidSave = await nextMessage(messages, ws, (msg) => msg.type === 'access_config_saved');
    assert.strictEqual(invalidSave.ok, false, 'invalid publicUrl with path/query/hash should be rejected');

    ws.send(JSON.stringify({
      type: 'save_access_config',
      config: {
        mode: 'public',
        directScope: 'local',
        publicUrl: 'https://fresh.example.com/',
        ngrok: { autoStart: false },
        frp: { autoStart: false },
      },
    }));
    const saved = await nextMessage(messages, ws, (msg) => msg.type === 'access_config_saved' && msg.ok);
    assert.strictEqual(saved.config.publicUrl, 'https://fresh.example.com', 'publicUrl should normalize to origin');
    const savedStatus = await nextMessage(messages, ws, (msg) => msg.type === 'access_status');
    assert.deepStrictEqual(savedStatus.status.urls.public, ['https://fresh.example.com'], 'status should use normalized public origin');

    ws.send(JSON.stringify({ type: 'create_quick_login', preferredUrlKind: 'remote' }));
    const missingRemote = await nextMessage(messages, ws, (msg) => msg.type === 'quick_login_created');
    assert.strictEqual(missingRemote.ok, false, 'unavailable remote quick login should fail');
    assert.strictEqual(missingRemote.reason, 'no_eligible_url', 'unavailable URL kind should report no_eligible_url');

    ws.send(JSON.stringify({ type: 'create_quick_login', preferredUrlKind: 'public' }));
    const created = await nextMessage(messages, ws, (msg) => msg.type === 'quick_login_created' && msg.ok);
    assert.strictEqual(created.baseUrlKind, 'public', 'quick_login_created should echo selected URL kind');
    assert.strictEqual(created.baseUrl, 'https://fresh.example.com', 'quick login should use public URL origin');
    assert(created.url.startsWith('https://fresh.example.com/#pair='), 'quick login URL should be fragment based');
    assert.strictEqual(typeof created.ttlSeconds, 'number', 'quick login response should include ttlSeconds');
    assert(Date.parse(created.expiresAt) > Date.now(), 'quick login response should include future expiresAt');
    assert.strictEqual(created.mustChangePassword, true, 'quick login should report mustChangePassword from auth config');

    const token = extractPairToken(created.url);
    const exchanged = await postJson(port, '/api/quick-login/exchange', { token });
    assert.strictEqual(exchanged.statusCode, 200, 'valid quick-login exchange should return HTTP 200');
    assert.strictEqual(exchanged.json.ok, true, 'valid quick-login exchange should succeed');
    assert(exchanged.json.sessionToken, 'valid quick-login exchange should return a session token');
    assert.strictEqual(exchanged.json.mustChangePassword, true, 'exchange should preserve must-change state');
    assert.strictEqual(exchanged.headers['cache-control'], 'no-store', 'quick-login exchange must be no-store');
    assert.strictEqual(exchanged.headers['referrer-policy'], 'no-referrer', 'quick-login exchange must set no-referrer');

    const replay = await postJson(port, '/api/quick-login/exchange', { token });
    assert.strictEqual(replay.statusCode, 410, 'replayed quick-login token should be gone');
    assert.strictEqual(replay.json.ok, false, 'replayed quick-login token should fail');

    ws.send(JSON.stringify({
      type: 'save_access_config',
      config: { mode: 'public', directScope: 'local', publicUrl: 'http://plain.example.com' },
    }));
    await nextMessage(messages, ws, (msg) => msg.type === 'access_config_saved' && msg.ok);
    await nextMessage(messages, ws, (msg) => msg.type === 'access_status');
    ws.send(JSON.stringify({ type: 'create_quick_login', preferredUrlKind: 'public' }));
    const plainDenied = await nextMessage(messages, ws, (msg) => msg.type === 'quick_login_created');
    assert.strictEqual(plainDenied.ok, false, 'plain public HTTP quick login should be denied');
    assert.strictEqual(plainDenied.reason, 'public_http_disabled', 'plain public HTTP denial should be explicit');
    assert(plainDenied.status && plainDenied.status.quickLogin, 'quick login denial should include fresh status');

    ws.send(JSON.stringify({
      type: 'save_access_config',
      config: { mode: 'direct', directScope: 'local', publicUrl: '' },
      clearFields: ['publicUrl'],
    }));
    const clearedPublic = await nextMessage(messages, ws, (msg) => msg.type === 'access_config_saved' && msg.ok);
    assert.strictEqual(clearedPublic.config.publicUrl, '', 'blank publicUrl plus clearFields should clear saved public URL');
    const directStatus = await nextMessage(messages, ws, (msg) => msg.type === 'access_status');
    assert.deepStrictEqual(directStatus.status.urls.public, [], 'non-public mode should not expose stale public URL');
    ws.send(JSON.stringify({ type: 'create_quick_login', preferredUrlKind: 'public' }));
    const noPublic = await nextMessage(messages, ws, (msg) => msg.type === 'quick_login_created');
    assert.strictEqual(noPublic.ok, false, 'cleared public URL should not be eligible for quick login');
    assert.strictEqual(noPublic.reason, 'no_eligible_url', 'cleared public URL should report no eligible URL');

    const invalidExchange = await postJson(port, '/api/quick-login/exchange', { token: 'does-not-exist' });
    assert.strictEqual(invalidExchange.statusCode, 410, 'unknown quick-login token should return defined failure status');
    assert.strictEqual(invalidExchange.json.ok, false, 'unknown quick-login token should return failure body');
    assert.strictEqual(invalidExchange.headers['cache-control'], 'no-store', 'failed quick-login exchange must be no-store');

    ws.close();
  });

  console.log('access HTTP/WS regression checks passed');
}

main().catch((err) => {
  console.error(err.stack || err.message || String(err));
  process.exit(1);
});
