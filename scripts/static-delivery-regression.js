#!/usr/bin/env node

const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const net = require('net');
const zlib = require('zlib');
const { spawn } = require('child_process');

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
    await fn({ stdout: () => stdout, stderr: () => stderr });
  } finally {
    child.kill('SIGTERM');
    await sleep(300);
    if (child.exitCode === null) child.kill('SIGKILL');
  }
}

function requestRaw(port, pathname, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: '127.0.0.1',
      port,
      path: pathname,
      method: 'GET',
      headers,
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({
        statusCode: res.statusCode || 0,
        headers: res.headers,
        body: Buffer.concat(chunks),
      }));
    });
    req.on('error', reject);
    req.end();
  });
}

async function main() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-web-static-delivery-'));
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

  const port = await getFreePort();
  await withServer({
    PORT: String(port),
    HOST: '127.0.0.1',
    CC_WEB_PASSWORD: 'StaticDelivery!234',
    CC_WEB_CONFIG_DIR: configDir,
    CC_WEB_SESSIONS_DIR: sessionsDir,
    CC_WEB_LOGS_DIR: logsDir,
  }, async () => {
    const first = await requestRaw(port, '/app.js', { 'Accept-Encoding': 'gzip' });
    assert(first.statusCode === 200, `Expected app.js 200, got ${first.statusCode}`);
    assert(first.headers['content-encoding'] === 'gzip', `Expected gzip encoding for app.js, got ${first.headers['content-encoding'] || '(none)'}`);
    assert(String(first.headers.vary || '').toLowerCase().includes('accept-encoding'), `Expected Vary: Accept-Encoding, got ${first.headers.vary || '(none)'}`);
    const etag = first.headers.etag;
    assert(etag, 'Expected compressed app.js response to include an ETag');
    const body = zlib.gunzipSync(first.body).toString('utf8');
    assert(body.includes('function connect()'), 'Expected gzip app.js body to decompress to browser source');

    const second = await requestRaw(port, '/app.js', {
      'Accept-Encoding': 'gzip',
      'If-None-Match': etag,
    });
    assert(second.statusCode === 304, `Expected gzip app.js conditional request to return 304, got ${second.statusCode}`);
    assert(second.headers['content-encoding'] === 'gzip', `Expected 304 validator response to preserve gzip variant, got ${second.headers['content-encoding'] || '(none)'}`);

    const weighted = await requestRaw(port, '/app.js', {
      'Accept-Encoding': 'br;q=0, gzip;q=1',
    });
    assert(weighted.statusCode === 200, `Expected weighted app.js request 200, got ${weighted.statusCode}`);
    assert(weighted.headers['content-encoding'] === 'gzip', `Expected q-weighted negotiation to choose gzip over forbidden br, got ${weighted.headers['content-encoding'] || '(none)'}`);

    const wildcard = await requestRaw(port, '/app.js', {
      'Accept-Encoding': 'br;q=0, gzip;q=0, *;q=1',
    });
    assert(wildcard.statusCode === 200, `Expected wildcard app.js request 200, got ${wildcard.statusCode}`);
    assert(!wildcard.headers['content-encoding'], `Expected wildcard fallback to avoid explicitly forbidden encodings, got ${wildcard.headers['content-encoding'] || '(none)'}`);

    const shell = await requestRaw(port, '/', { 'Accept-Encoding': 'gzip, br' });
    assert(shell.statusCode === 200, `Expected index shell 200, got ${shell.statusCode}`);
    assert(shell.headers['cache-control'] === 'no-cache', `Expected index shell to stay no-cache, got ${shell.headers['cache-control'] || '(none)'}`);
  });

  console.log('static delivery regression passed');
}

main().catch((err) => {
  console.error(err.stack || err.message);
  process.exit(1);
});
