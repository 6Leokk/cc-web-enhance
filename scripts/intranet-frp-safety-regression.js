#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const { resolveServerBindConfig } = require('../lib/server-config');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readRepoFile(filePath) {
  return fs.readFileSync(path.join(root, filePath), 'utf8');
}

function assertFileExists(filePath) {
  assert(fs.existsSync(path.join(root, filePath)), `${filePath} should exist`);
}

function assertNoDangerousCommands(filePath) {
  const content = readRepoFile(filePath);
  const dangerous = [
    /rm\s+-rf/,
    /git\s+reset\s+--hard/,
    /git\s+clean\s+-fdx?/,
    /chmod\s+777/,
    /cp\s+["']?\$?HOME\/\.codex/,
    /cp\s+["']?~\/\.codex/,
    /cat\s+["']?~\/\.codex/,
    /<\s*["']?~\/\.codex/,
  ];
  for (const pattern of dangerous) {
    assert(!pattern.test(content), `${filePath} contains dangerous command pattern ${pattern}`);
  }
}

function assertNoForbiddenSecrets(filePath) {
  const content = readRepoFile(filePath);
  const forbidden = [
    /~\/\.codex\/auth\.json/,
    /~\/\.codex\/config\.toml/,
    /sk-[A-Za-z0-9_-]{20,}/,
    /ghp_[A-Za-z0-9_]{20,}/,
    /xox[baprs]-[A-Za-z0-9-]{20,}/,
  ];
  for (const pattern of forbidden) {
    assert(!pattern.test(content), `${filePath} contains forbidden secret/path pattern ${pattern}`);
  }
}

function assertNoRealPublicEndpoint(filePath) {
  const content = readRepoFile(filePath);
  const ipv4Matches = content.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g) || [];
  const unexpectedIps = ipv4Matches.filter((ip) => ip !== '127.0.0.1');
  assert(unexpectedIps.length === 0, `${filePath} contains real-looking IPs: ${unexpectedIps.join(', ')}`);
  assert(!/\b(?:[a-z0-9-]+\.)+(?:com|net|org|cn|io|dev|app)\b/i.test(content.replace(/YOUR_DOMAIN/g, '')), `${filePath} contains a real-looking domain`);
}

function assertTomlHasLine(content, pattern, message) {
  assert(content.split('\n').some((line) => pattern.test(line)), message);
}

function checkBindConfig() {
  const defaults = resolveServerBindConfig({});
  assert(defaults.host === '127.0.0.1', 'default host should be 127.0.0.1');
  assert(defaults.port === 8083, 'default port should be 8083');

  const ccWebEnv = resolveServerBindConfig({ CC_WEB_HOST: '127.0.0.2', CC_WEB_PORT: '18083' });
  assert(ccWebEnv.host === '127.0.0.2', 'CC_WEB_HOST should override host');
  assert(ccWebEnv.port === 18083, 'CC_WEB_PORT should override port');

  const legacyEnv = resolveServerBindConfig({ HOST: '127.0.0.3', PORT: '18084' });
  assert(legacyEnv.host === '127.0.0.3', 'legacy HOST should still work');
  assert(legacyEnv.port === 18084, 'legacy PORT should still work');

  const priority = resolveServerBindConfig({
    CC_WEB_HOST: '127.0.0.4',
    CC_WEB_PORT: '18085',
    HOST: '0.0.0.0',
    PORT: '18086',
  });
  assert(priority.host === '127.0.0.4', 'CC_WEB_HOST should take priority over HOST');
  assert(priority.port === 18085, 'CC_WEB_PORT should take priority over PORT');

  const publicBind = resolveServerBindConfig({ CC_WEB_HOST: '0.0.0.0', CC_WEB_PORT: '18087' });
  assert(publicBind.host === '0.0.0.0', 'explicit public bind should remain possible');

  for (const port of ['0', '65536', 'abc', '12.5', '-1']) {
    let threw = false;
    try {
      resolveServerBindConfig({ CC_WEB_PORT: port });
    } catch (err) {
      threw = /CC_WEB_PORT/.test(String(err.message));
    }
    assert(threw, `invalid CC_WEB_PORT=${port} should throw a clear error`);
  }
}

function checkFrpExamples() {
  const files = [
    'deploy/frp/frps.example.toml',
    'deploy/frp/frpc.example.toml',
    'deploy/frp/README.md',
  ];
  for (const file of files) {
    assertFileExists(file);
    assertNoForbiddenSecrets(file);
    assertNoRealPublicEndpoint(file);
  }

  const frps = readRepoFile('deploy/frp/frps.example.toml');
  assertTomlHasLine(frps, /^\s*bindPort\s*=\s*\d+/, 'frps example should set bindPort');
  assertTomlHasLine(frps, /^\s*auth\.token\s*=\s*"YOUR_FRP_TOKEN"/, 'frps example should use YOUR_FRP_TOKEN');
  assert(!/^\s*dashboardPort\s*=/m.test(frps), 'frps dashboard should not be enabled by default');
  assert(/#\s*vhostHTTPPort/.test(frps), 'frps example should document optional vhostHTTPPort as a comment');

  const frpc = readRepoFile('deploy/frp/frpc.example.toml');
  assertTomlHasLine(frpc, /^\s*serverAddr\s*=\s*"YOUR_FRP_SERVER_IP"/, 'frpc example should use YOUR_FRP_SERVER_IP');
  assertTomlHasLine(frpc, /^\s*auth\.token\s*=\s*"YOUR_FRP_TOKEN"/, 'frpc example should use YOUR_FRP_TOKEN');
  assertTomlHasLine(frpc, /^\s*localIP\s*=\s*"127\.0\.0\.1"/, 'frpc localIP should be 127.0.0.1');
  assertTomlHasLine(frpc, /^\s*localPort\s*=\s*8083/, 'frpc localPort should be 8083');
  assert(/YOUR_PUBLIC_PORT/.test(frpc) || /YOUR_DOMAIN/.test(frpc), 'frpc should include public port or domain placeholder');
}

function checkScripts() {
  const scripts = [
    'scripts/frp/check-frp-config.sh',
    'scripts/frp/check-local-cc-web.sh',
  ];
  for (const script of scripts) {
    assertFileExists(script);
    assertNoDangerousCommands(script);
    const syntax = spawnSync('bash', ['-n', path.join(root, script)], { encoding: 'utf8' });
    assert(syntax.status === 0, `${script} should pass bash -n: ${syntax.stderr}`);
  }

  const localCheck = readRepoFile('scripts/frp/check-local-cc-web.sh');
  assert(/127\.0\.0\.1/.test(localCheck), 'local cc-web check should target 127.0.0.1');
  assert(/8083/.test(localCheck), 'local cc-web check should target port 8083');
  assert(!/0\.0\.0\.0/.test(localCheck), 'local cc-web check should not bind or target 0.0.0.0');
}

function checkDocs() {
  const docs = [
    'README.md',
    'README.en.md',
    '.env.example',
    'docs/intranet-access-design.md',
    'docs/deploy-frp.md',
    'docs/security/intranet-access-threat-model.md',
  ];
  for (const file of docs) {
    assertFileExists(file);
    assertNoForbiddenSecrets(file);
  }

  const readme = readRepoFile('README.md');
  assert(readme.includes('docs/deploy-frp.md'), 'README should link to deploy-frp docs');
  assert(readme.includes('127.0.0.1:8083'), 'README should document the safe default bind');

  const envExample = readRepoFile('.env.example');
  assert(/CC_WEB_PORT=8083/.test(envExample), '.env.example should use CC_WEB_PORT=8083');
  assert(/CC_WEB_HOST=127\.0\.0\.1/.test(envExample), '.env.example should use CC_WEB_HOST=127.0.0.1');

  const deployDoc = readRepoFile('docs/deploy-frp.md');
  for (const required of ['认证', 'HTTPS', '防火墙', 'YOUR_FRP_TOKEN']) {
    assert(deployDoc.includes(required), `deploy doc should mention ${required}`);
  }
}

checkBindConfig();
checkFrpExamples();
checkScripts();
checkDocs();

console.log('intranet frp safety regression checks passed');
