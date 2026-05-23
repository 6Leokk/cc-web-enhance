#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const accessConfig = require('../lib/access-config');

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cc-web-access-config-'));
}

function readConfigFile(configDir) {
  return JSON.parse(fs.readFileSync(path.join(configDir, 'access.json'), 'utf8'));
}

function cleanup(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {}
}

function testDefaults() {
  const dir = makeTempDir();
  try {
    const loaded = accessConfig.loadAccessConfig(dir);
    assert.deepStrictEqual(loaded, accessConfig.buildDefaultAccessConfig(), 'load should return defaults when file is absent');

    const resolved = accessConfig.resolveAccessConfig({}, { configDir: dir });
    assert.strictEqual(resolved.mode, 'direct', 'default mode should be direct');
    assert.strictEqual(resolved.directScope, 'local', 'default direct scope should be local');
    assert.strictEqual(resolved.publicUrl, '', 'default public URL should be empty');
    assert.strictEqual(resolved.ngrok.autoStart, true, 'default ngrok autoStart should be true');
    assert.strictEqual(resolved.frp.autoStart, true, 'default frp autoStart should be true');
    assert.deepStrictEqual(resolved.lockedFields, [], 'default locked fields should be empty');
    assert.strictEqual(resolved.source.mode, 'default', 'default mode source should be default');
    assert.strictEqual(resolved.source.directScope, 'default', 'default direct scope source should be default');
    assert.strictEqual(resolved.source.publicUrl, 'default', 'default public URL source should be default');
  } finally {
    cleanup(dir);
  }
}

function testEnvPrecedence() {
  const dir = makeTempDir();
  try {
    accessConfig.saveAccessConfig(dir, {
      mode: 'public',
      directScope: 'lan',
      publicUrl: 'https://file.example.com',
      ngrok: {
        authtoken: 'file-token',
        domain: 'file.example.com',
        basicAuth: 'file:basic',
        autoStart: false,
      },
      frp: {
        autoStart: false,
      },
    });

    const resolved = accessConfig.resolveAccessConfig({
      CC_WEB_ACCESS_MODE: 'ngrok',
      CC_WEB_DIRECT_SCOPE: 'lan',
      CC_WEB_PUBLIC_URL: 'https://env.example.com/',
      CC_WEB_TRUST_PROXY: 'yes',
      NGROK_AUTHTOKEN: 'env-token',
      NGROK_DOMAIN: 'env.example.com',
      NGROK_BASIC_AUTH: 'env:basic',
      NGROK_AUTO_START: '0',
      FRP_AUTO_START: '1',
    }, { configDir: dir });

    assert.strictEqual(resolved.mode, 'ngrok', 'env access mode should win');
    assert.strictEqual(resolved.directScope, 'lan', 'env direct scope should win');
    assert.strictEqual(resolved.publicUrl, 'https://env.example.com', 'env public URL should be normalized and win');
    assert.strictEqual(resolved.trustProxy, true, 'trust proxy should respect env');
    assert.strictEqual(resolved.ngrok.authtoken, 'env-token', 'ngrok authtoken should come from env');
    assert.strictEqual(resolved.ngrok.domain, 'env.example.com', 'ngrok domain should come from env');
    assert.strictEqual(resolved.ngrok.basicAuth, 'env:basic', 'ngrok basic auth should come from env');
    assert.strictEqual(resolved.ngrok.autoStart, false, 'ngrok autoStart should parse env boolean');
    assert.strictEqual(resolved.frp.autoStart, true, 'frp autoStart should parse env boolean');
    for (const field of ['mode', 'directScope', 'publicUrl', 'ngrok.authtoken', 'ngrok.domain', 'ngrok.basicAuth', 'ngrok.autoStart', 'frp.autoStart']) {
      assert(resolved.lockedFields.includes(field), `locked fields should include ${field}`);
    }
  } finally {
    cleanup(dir);
  }
}

function testTrustProxyParsing() {
  const dir = makeTempDir();
  try {
    assert.strictEqual(
      accessConfig.resolveAccessConfig({ CC_WEB_TRUST_PROXY: 'true' }, { configDir: dir }).trustProxy,
      true,
      'trust proxy should accept true',
    );
    assert.strictEqual(
      accessConfig.resolveAccessConfig({ CC_WEB_TRUST_PROXY: '0' }, { configDir: dir }).trustProxy,
      false,
      'trust proxy should accept 0',
    );
    assert.throws(
      () => accessConfig.resolveAccessConfig({ CC_WEB_TRUST_PROXY: 'maybe' }, { configDir: dir }),
      /Invalid boolean/,
      'invalid trust proxy value should be rejected',
    );
  } finally {
    cleanup(dir);
  }
}

function testFrpCompatibilityFallback() {
  const dir = makeTempDir();
  try {
    const resolved = accessConfig.resolveAccessConfig({
      FRP_MODE: 'client',
    }, { configDir: dir });

    assert.strictEqual(resolved.mode, 'frp', 'FRP_MODE client should resolve to frp mode');
    assert.strictEqual(resolved.source.mode, 'compatibility', 'compatibility source should be recorded');
    assert(resolved.lockedFields.includes('mode'), 'compatibility fallback should lock mode');

    accessConfig.saveAccessConfig(dir, { mode: 'public' });
    const configBeatsCompatibility = accessConfig.resolveAccessConfig({
      FRP_MODE: 'client',
    }, { configDir: dir });
    assert.strictEqual(configBeatsCompatibility.mode, 'public', 'saved config mode should beat FRP compatibility fallback');
    assert.strictEqual(configBeatsCompatibility.source.mode, 'config', 'saved config source should beat compatibility fallback');

    const envBeatsConfig = accessConfig.resolveAccessConfig({
      CC_WEB_ACCESS_MODE: 'ngrok',
      FRP_MODE: 'client',
    }, { configDir: dir });
    assert.strictEqual(envBeatsConfig.mode, 'ngrok', 'explicit CC_WEB_ACCESS_MODE should beat saved config and FRP compatibility fallback');
  } finally {
    cleanup(dir);
  }
}

function testNgrokTokenDoesNotInferMode() {
  const dir = makeTempDir();
  try {
    const resolved = accessConfig.resolveAccessConfig({
      NGROK_AUTHTOKEN: 'token-only',
    }, { configDir: dir });

    assert.strictEqual(resolved.mode, 'direct', 'NGROK_AUTHTOKEN alone should not infer ngrok mode');
    assert.strictEqual(resolved.ngrok.authtoken, 'token-only', 'NGROK_AUTHTOKEN should still populate token');
    assert.strictEqual(resolved.source.mode, 'default', 'mode source should remain default when only ngrok token is set');
  } finally {
    cleanup(dir);
  }
}

function testRoundTripAndMasking() {
  const dir = makeTempDir();
  try {
    const saved = accessConfig.saveAccessConfig(dir, {
      mode: 'public',
      directScope: 'lan',
      publicUrl: 'https://cc-web.example.com/',
      ngrok: {
        authtoken: 'secret-token',
        domain: 'cc-web.example.com',
        basicAuth: 'user:pass',
        autoStart: false,
      },
      frp: {
        autoStart: false,
      },
    });

    assert.strictEqual(saved.publicUrl, 'https://cc-web.example.com', 'public URL should be normalized to origin');
    assert.deepStrictEqual(accessConfig.loadAccessConfig(dir), saved, 'load should round-trip saved config');

    const masked = accessConfig.maskAccessConfig(saved);
    assert.strictEqual(masked.ngrok.authtoken, 'secr****oken', 'masked token should hide middle characters');
    assert.strictEqual(masked.ngrok.basicAuth, 'user****pass', 'masked basicAuth should hide middle characters');
    assert.strictEqual(masked.ngrok.domain, 'cc-web.example.com', 'non-secret ngrok fields should remain visible');

    const file = readConfigFile(dir);
    assert.strictEqual(file.ngrok.authtoken, 'secret-token', 'stored file should keep raw secret');

    const literalStars = accessConfig.saveAccessConfig(dir, {
      ngrok: {
        authtoken: 'literal****secret',
      },
    });
    assert.strictEqual(literalStars.ngrok.authtoken, 'literal****secret', 'literal secret containing **** beyond mask shape should update');
  } finally {
    cleanup(dir);
  }
}

function testMalformedJsonError() {
  const dir = makeTempDir();
  try {
    fs.writeFileSync(path.join(dir, 'access.json'), '{not json');
    assert.throws(
      () => accessConfig.loadAccessConfig(dir),
      /Failed to parse .*access\.json/,
      'malformed access config should throw contextual parse error',
    );
  } finally {
    cleanup(dir);
  }
}

function testMaskedSecretPreservation() {
  const dir = makeTempDir();
  try {
    accessConfig.saveAccessConfig(dir, {
      ngrok: {
        authtoken: 'first-secret',
        domain: 'first.example.com',
        basicAuth: 'user:first',
        autoStart: true,
      },
    });

    const saved = accessConfig.saveAccessConfig(dir, {
      ngrok: {
        authtoken: '****',
        domain: 'second.example.com',
        basicAuth: '****',
      },
    });

    assert.strictEqual(saved.ngrok.authtoken, 'first-secret', 'masked authtoken should preserve previous value');
    assert.strictEqual(saved.ngrok.basicAuth, 'user:first', 'masked basic auth should preserve previous value');
    assert.strictEqual(saved.ngrok.domain, 'second.example.com', 'non-secret fields should still update');
  } finally {
    cleanup(dir);
  }
}

function testExplicitClear() {
  const dir = makeTempDir();
  try {
    accessConfig.saveAccessConfig(dir, {
      ngrok: {
        authtoken: 'clear-me',
        domain: 'clear.example.com',
        basicAuth: 'user:clear',
      },
    });

    const preserved = accessConfig.saveAccessConfig(dir, {
      ngrok: {
        authtoken: '',
      },
    });
    assert.strictEqual(preserved.ngrok.authtoken, 'clear-me', 'empty secret input should preserve value without explicit clear');

    const cleared = accessConfig.saveAccessConfig(dir, {
      ngrok: {
        authtoken: '',
      },
    }, {
      clearFields: ['ngrok.authtoken'],
    });
    assert.strictEqual(cleared.ngrok.authtoken, '', 'explicit clear should remove secret');

    accessConfig.saveAccessConfig(dir, {
      publicUrl: 'https://clear.example.com',
    });
    const clearedPublicUrl = accessConfig.saveAccessConfig(dir, {}, {
      clearFields: ['publicUrl'],
    });
    assert.strictEqual(clearedPublicUrl.publicUrl, '', 'explicit clear should remove publicUrl even when omitted from payload');

    accessConfig.saveAccessConfig(dir, {
      ngrok: {
        authtoken: 'locked-secret',
      },
    });
    assert.throws(
      () => accessConfig.saveAccessConfig(dir, {}, {
        env: { NGROK_AUTHTOKEN: 'env-secret' },
        clearFields: ['ngrok.authtoken'],
      }),
      /Cannot clear ngrok\.authtoken/,
      'explicit clear should be rejected for env-locked fields',
    );
    assert.strictEqual(accessConfig.loadAccessConfig(dir).ngrok.authtoken, 'locked-secret', 'rejected env-locked clear should preserve stored secret');
  } finally {
    cleanup(dir);
  }
}

function testPublicUrlNormalization() {
  const dir = makeTempDir();
  try {
    const saved = accessConfig.saveAccessConfig(dir, {
      publicUrl: 'https://cc.example.com/',
    });
    assert.strictEqual(saved.publicUrl, 'https://cc.example.com', 'trailing slash should be stripped');
    assert.throws(
      () => accessConfig.saveAccessConfig(dir, { publicUrl: 'https://cc.example.com/app' }),
      /origin without path/i,
      'path in public URL should be rejected',
    );
    assert.throws(
      () => accessConfig.saveAccessConfig(dir, { publicUrl: 'ftp://cc.example.com' }),
      /http or https/i,
      'non-http(s) public URL should be rejected',
    );
    assert.throws(
      () => accessConfig.saveAccessConfig(dir, { publicUrl: 'https://user:pass@cc.example.com' }),
      /credentials/i,
      'credentials in public URL should be rejected',
    );
    assert.throws(
      () => accessConfig.saveAccessConfig(dir, { publicUrl: 'https://cc.example.com?debug=1' }),
      /origin without path/i,
      'query string in public URL should be rejected',
    );
    assert.throws(
      () => accessConfig.saveAccessConfig(dir, { publicUrl: 'https://cc.example.com#pair=bad' }),
      /origin without path/i,
      'hash in public URL should be rejected',
    );
  } finally {
    cleanup(dir);
  }
}

function testInvalidModeRejection() {
  assert.throws(
    () => accessConfig.normalizeAccessMode('bogus'),
    /CC_WEB_ACCESS_MODE/,
    'invalid access mode should throw',
  );
  assert.throws(
    () => accessConfig.saveAccessConfig(makeTempDir(), { mode: 'bogus' }),
    /CC_WEB_ACCESS_MODE/,
    'saving invalid access mode should throw',
  );
}

function testLockedFieldReporting() {
  const dir = makeTempDir();
  try {
    const resolved = accessConfig.resolveAccessConfig({
      CC_WEB_ACCESS_MODE: 'public',
      CC_WEB_DIRECT_SCOPE: 'lan',
      CC_WEB_PUBLIC_URL: 'https://locked.example.com/',
      NGROK_AUTHTOKEN: 'locked-token',
      FRP_AUTO_START: '0',
    }, { configDir: dir });

    assert.strictEqual(resolved.publicUrl, 'https://locked.example.com', 'public URL should normalize');
    for (const field of ['mode', 'directScope', 'publicUrl', 'ngrok.authtoken', 'frp.autoStart']) {
      assert(resolved.lockedFields.includes(field), `locked fields should include ${field}`);
    }
  } finally {
    cleanup(dir);
  }
}

function main() {
  testDefaults();
  testEnvPrecedence();
  testTrustProxyParsing();
  testFrpCompatibilityFallback();
  testNgrokTokenDoesNotInferMode();
  testRoundTripAndMasking();
  testMalformedJsonError();
  testMaskedSecretPreservation();
  testExplicitClear();
  testPublicUrlNormalization();
  testInvalidModeRejection();
  testLockedFieldReporting();
  console.log('access config regression checks passed');
}

main();
