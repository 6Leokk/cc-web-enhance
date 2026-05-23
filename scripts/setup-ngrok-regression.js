#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.resolve(__dirname, '..');

function read(filePath) {
  return fs.readFileSync(path.join(root, filePath), 'utf8');
}

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cc-web-ngrok-setup-'));
}

function cleanup(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {}
}

function testEnvContentUpdate() {
  const setupNgrok = require('./setup-ngrok');
  const input = [
    '# existing file',
    'CC_WEB_ACCESS_MODE=direct',
    'CC_WEB_HOST=0.0.0.0',
    '# NGROK_AUTHTOKEN=YOUR_NGROK_AUTHTOKEN',
    '# NGROK_DOMAIN=YOUR_DOMAIN',
    'NGROK_AUTO_START=0',
    '',
  ].join('\n');

  const output = setupNgrok.updateEnvContent(input, {
    CC_WEB_ACCESS_MODE: 'ngrok',
    CC_WEB_HOST: '127.0.0.1',
    NGROK_AUTHTOKEN: 'token-123',
    NGROK_DOMAIN: '',
    NGROK_BASIC_AUTH: 'user:pass',
    NGROK_AUTO_START: '1',
  });

  assert(output.includes('CC_WEB_ACCESS_MODE=ngrok'), 'setup should switch access mode to ngrok');
  assert(output.includes('CC_WEB_HOST=127.0.0.1'), 'setup should keep ngrok upstream local-only');
  assert(output.includes('NGROK_AUTHTOKEN=token-123'), 'setup should activate ngrok authtoken');
  assert(output.includes('NGROK_DOMAIN='), 'setup should clear stale or example ngrok domain when omitted');
  assert(output.includes('NGROK_BASIC_AUTH=user:pass'), 'setup should write optional basic auth when provided');
  assert(output.includes('NGROK_AUTO_START=1'), 'setup should enable ngrok auto start');
  assert.strictEqual((output.match(/NGROK_AUTHTOKEN=/g) || []).length, 1, 'setup should not duplicate ngrok token');
}

function testRunSetupWritesEnvWithoutStarting() {
  const setupNgrok = require('./setup-ngrok');
  const dir = makeTempDir();
  try {
    fs.writeFileSync(path.join(dir, '.env.example'), [
      'CC_WEB_PORT=8083',
      'CC_WEB_HOST=127.0.0.1',
      'CC_WEB_ACCESS_MODE=direct',
      '# NGROK_AUTHTOKEN=YOUR_NGROK_AUTHTOKEN',
      '# NGROK_AUTO_START=1',
      '',
    ].join('\n'));

    const result = setupNgrok.runSetup({
      cwd: dir,
      token: 'token-from-cli',
      domain: 'demo.ngrok-free.app',
      basicAuth: '',
      start: false,
      interactive: false,
    });

    const env = fs.readFileSync(path.join(dir, '.env'), 'utf8');
    assert.strictEqual(result.started, false, 'setup-only mode should not start server');
    assert(env.includes('CC_WEB_ACCESS_MODE=ngrok'), 'setup should write ngrok mode to .env');
    assert(env.includes('NGROK_AUTHTOKEN=token-from-cli'), 'setup should write token to .env');
    assert(env.includes('NGROK_DOMAIN=demo.ngrok-free.app'), 'setup should write optional domain to .env');
    assert(env.includes('NGROK_AUTO_START=1'), 'setup should enable ngrok auto start in .env');
  } finally {
    cleanup(dir);
  }
}

function testFullyCommandLineOptions() {
  const setupNgrok = require('./setup-ngrok');
  const parsed = setupNgrok.parseArgs([
    '--start',
    '--token',
    'token-from-terminal',
    '--domain',
    'demo.ngrok-free.app',
    '--basic-auth',
    'user:pass',
  ]);

  assert.strictEqual(parsed.start, true, 'CLI setup should parse --start');
  assert.strictEqual(parsed.token, 'token-from-terminal', 'CLI setup should parse --token');
  assert.strictEqual(parsed.domain, 'demo.ngrok-free.app', 'CLI setup should parse --domain');
  assert.strictEqual(parsed.basicAuth, 'user:pass', 'CLI setup should parse --basic-auth');
  assert.strictEqual(
    setupNgrok.shouldPromptForOptionalFields(parsed, {}, {}),
    false,
    'explicit token CLI setup should not prompt for optional fields',
  );
  assert.strictEqual(
    setupNgrok.shouldPromptForOptionalFields({}, { NGROK_AUTHTOKEN: 'saved-token' }, {}),
    false,
    'saved token setup should not prompt for optional fields',
  );
  assert.strictEqual(
    setupNgrok.shouldPromptForOptionalFields({}, {}, { NGROK_AUTHTOKEN: 'env-token' }),
    false,
    'env token setup should not prompt for optional fields',
  );
  assert.strictEqual(
    setupNgrok.shouldPromptForOptionalFields({}, {}, {}),
    true,
    'first-run setup without any token should prompt for optional fields after prompting for token',
  );
}

function testMissingTokenFailsInNonInteractiveMode() {
  const setupNgrok = require('./setup-ngrok');
  const dir = makeTempDir();
  try {
    assert.throws(
      () => setupNgrok.runSetup({ cwd: dir, start: false, interactive: false }),
      /NGROK_AUTHTOKEN is required/,
      'non-interactive setup should fail clearly when no token is available',
    );
  } finally {
    cleanup(dir);
  }
}

function testPackageScriptsAndDocs() {
  const pkg = JSON.parse(read('package.json'));
  assert.strictEqual(pkg.scripts['setup:ngrok'], 'node scripts/setup-ngrok.js', 'package should expose setup:ngrok');
  assert.strictEqual(pkg.scripts['start:ngrok'], 'node scripts/setup-ngrok.js --start', 'package should expose start:ngrok');
  assert.strictEqual(pkg.scripts['regression:setup-ngrok'], 'node scripts/setup-ngrok-regression.js', 'package should expose setup ngrok regression');

  const readme = read('README.md');
  assert(readme.includes('npm run start:ngrok'), 'README should document the fastest ngrok start command');
  assert(readme.includes('npm run start:ngrok -- --token'), 'README should document fully terminal ngrok setup');
  assert(readme.includes('npm run setup:ngrok'), 'README should document setup-only ngrok command');
}

testEnvContentUpdate();
testRunSetupWritesEnvWithoutStarting();
testFullyCommandLineOptions();
testMissingTokenFailsInNonInteractiveMode();
testPackageScriptsAndDocs();

console.log('ngrok setup regression checks passed');
