#!/usr/bin/env node

const assert = require('assert');

const {
  isAccessIdentityWhitelisted,
  resolveAuthClientIdentity,
} = require('../lib/access-auth-ip');

function req(remoteAddress, headers = {}) {
  return {
    socket: { remoteAddress },
    headers,
  };
}

function checkDirectIdentity() {
  const loopback = resolveAuthClientIdentity(req('::ffff:127.0.0.1'), {
    accessMode: 'direct',
    directScope: 'local',
    trustProxy: false,
  });
  assert.strictEqual(loopback.identity, '127.0.0.1', 'direct/local should normalize loopback socket IP');
  assert.strictEqual(loopback.kind, 'ip', 'direct/local loopback should remain a real IP identity');
  assert.strictEqual(loopback.whitelistEligible, true, 'direct/local loopback should remain whitelist-eligible');
  assert.strictEqual(isAccessIdentityWhitelisted(loopback), true, 'direct/local loopback should be whitelisted');

  const loopbackRange = resolveAuthClientIdentity(req('127.0.0.2'), {
    accessMode: 'direct',
    directScope: 'local',
    trustProxy: false,
  });
  assert.strictEqual(loopbackRange.identity, '127.0.0.2', 'direct/local should preserve loopback-range socket IP');
  assert.strictEqual(isAccessIdentityWhitelisted(loopbackRange), true, 'direct/local loopback range should be whitelisted consistently');

  const lan = resolveAuthClientIdentity(req('192.168.1.45', {
    'x-forwarded-for': '203.0.113.10',
  }), {
    accessMode: 'direct',
    directScope: 'lan',
    trustProxy: false,
  });
  assert.strictEqual(lan.identity, '192.168.1.45', 'direct/LAN should use socket address when proxy trust is disabled');
  assert.strictEqual(lan.whitelistEligible, true, 'direct/LAN real IP should be whitelist-eligible');

  const tailscaleSocket = resolveAuthClientIdentity(req('100.64.1.2'), {
    accessMode: 'direct',
    directScope: 'lan',
    trustProxy: false,
  });
  assert.strictEqual(
    isAccessIdentityWhitelisted(tailscaleSocket),
    true,
    'Tailscale-style 100.* auto-whitelist should apply to direct socket identities',
  );

  const trusted = resolveAuthClientIdentity(req('198.51.100.7', {
    'x-forwarded-for': '203.0.113.14, 10.0.0.1',
  }), {
    accessMode: 'direct',
    directScope: 'lan',
    trustProxy: true,
  });
  assert.strictEqual(trusted.identity, '203.0.113.14', 'direct/LAN should use first forwarded IP when proxy trust is enabled');
  assert.strictEqual(trusted.kind, 'ip', 'trusted direct/LAN forwarded client should be a real IP identity');
  assert.strictEqual(trusted.whitelistEligible, true, 'trusted direct/LAN forwarded client should be whitelist-eligible');

  const invalidFirstForwarded = resolveAuthClientIdentity(req('198.51.100.7', {
    'x-forwarded-for': 'unknown, 203.0.113.15',
  }), {
    accessMode: 'direct',
    directScope: 'lan',
    trustProxy: true,
  });
  assert.strictEqual(
    invalidFirstForwarded.identity,
    '198.51.100.7',
    'direct/LAN must not skip an invalid first forwarded value to trust a later X-Forwarded-For entry',
  );

  const directWithStaleProvider = resolveAuthClientIdentity(req('127.0.0.1'), {
    accessMode: 'direct',
    provider: 'ngrok',
    trustProxy: false,
  });
  assert.strictEqual(
    directWithStaleProvider.identity,
    '127.0.0.1',
    'direct mode must not be converted to tunnel identity by a stale provider value',
  );
}

function checkPublicProxyTrust() {
  const noTrust = resolveAuthClientIdentity(req('198.51.100.7', {
    'x-forwarded-for': '203.0.113.8',
  }), {
    accessMode: 'public',
    trustProxy: false,
  });
  assert.strictEqual(noTrust.identity, '198.51.100.7', 'public mode should ignore X-Forwarded-For without proxy trust');

  const trusted = resolveAuthClientIdentity(req('198.51.100.7', {
    'x-forwarded-for': '::ffff:203.0.113.8, 10.0.0.1',
  }), {
    accessMode: 'public',
    trustProxy: true,
  });
  assert.strictEqual(trusted.identity, '203.0.113.8', 'public mode should use first forwarded IP when proxy trust is enabled');
  assert.strictEqual(trusted.kind, 'ip', 'trusted forwarded client should be a real IP identity');
  assert.strictEqual(trusted.whitelistEligible, true, 'trusted forwarded client should be whitelist-eligible');

  const forwardedTailscaleRange = resolveAuthClientIdentity(req('198.51.100.7', {
    'x-forwarded-for': '100.64.1.2',
  }), {
    accessMode: 'public',
    trustProxy: true,
  });
  assert.strictEqual(
    isAccessIdentityWhitelisted(forwardedTailscaleRange),
    false,
    'Tailscale-style 100.* auto-whitelist should not apply to forwarded identities',
  );
  assert.strictEqual(
    isAccessIdentityWhitelisted(forwardedTailscaleRange, { ipWhitelist: ['100.64.1.2'] }),
    true,
    'extra whitelist should still apply to resolved forwarded real client IPs',
  );

  const invalidFirstForwarded = resolveAuthClientIdentity(req('198.51.100.7', {
    'x-forwarded-for': 'unknown, 203.0.113.9',
  }), {
    accessMode: 'public',
    trustProxy: true,
  });
  assert.strictEqual(
    invalidFirstForwarded.identity,
    '198.51.100.7',
    'public mode must not skip an invalid first forwarded value to trust a later X-Forwarded-For entry',
  );
}

function checkTunnelSharedIdentity() {
  const ngrok = resolveAuthClientIdentity(req('127.0.0.1', {
    'x-forwarded-for': '203.0.113.11',
  }), {
    accessMode: 'ngrok',
    provider: 'ngrok',
    trustProxy: false,
  });
  assert.deepStrictEqual(
    {
      identity: ngrok.identity,
      kind: ngrok.kind,
      whitelistEligible: ngrok.whitelistEligible,
    },
    {
      identity: 'tunnel:ngrok:unknown',
      kind: 'tunnel-shared',
      whitelistEligible: false,
    },
    'ngrok loopback traffic without proxy trust should use a shared non-whitelist tunnel identity',
  );
  assert.strictEqual(
    isAccessIdentityWhitelisted(ngrok, { ipWhitelist: ['tunnel:ngrok:unknown', '127.0.0.1'] }),
    false,
    'shared tunnel identities must not be whitelisted even if their string appears in extra whitelist',
  );

  const frp = resolveAuthClientIdentity(req('::1'), {
    accessMode: 'frp',
    provider: 'frp',
    trustProxy: false,
  });
  assert.strictEqual(frp.identity, 'tunnel:frp:unknown', 'frp loopback traffic should use the frp shared identity');
  assert.strictEqual(frp.whitelistEligible, false, 'frp shared identity should not be whitelist-eligible');
}

function checkTunnelTrustedForwardedIdentity() {
  const trusted = resolveAuthClientIdentity(req('127.0.0.1', {
    'x-forwarded-for': '203.0.113.12, 10.0.0.2',
  }), {
    accessMode: 'ngrok',
    provider: 'ngrok',
    trustProxy: true,
  });
  assert.strictEqual(trusted.identity, '203.0.113.12', 'trusted tunnel traffic should use first forwarded client IP');
  assert.strictEqual(trusted.kind, 'ip', 'trusted tunnel forwarded client should be a real IP identity');
  assert.strictEqual(trusted.whitelistEligible, true, 'trusted tunnel forwarded client should be whitelist-eligible');
  assert.strictEqual(
    isAccessIdentityWhitelisted(trusted, { ipWhitelist: ['203.0.113.12'] }),
    true,
    'extra whitelist should apply to resolved real client IP identities',
  );

  const invalidFirstForwarded = resolveAuthClientIdentity(req('127.0.0.1', {
    'x-forwarded-for': 'unknown, 203.0.113.13',
  }), {
    accessMode: 'ngrok',
    provider: 'ngrok',
    trustProxy: true,
  });
  assert.strictEqual(
    invalidFirstForwarded.identity,
    'tunnel:ngrok:unknown',
    'trusted tunnel mode must not skip an invalid first forwarded value to trust a later X-Forwarded-For entry',
  );
  assert.strictEqual(
    invalidFirstForwarded.whitelistEligible,
    false,
    'invalid first forwarded tunnel fallback should remain non-whitelist shared identity',
  );

  const invalidFirstForwardedNonLoopback = resolveAuthClientIdentity(req('198.51.100.7', {
    'x-forwarded-for': 'unknown, 203.0.113.16',
  }), {
    accessMode: 'ngrok',
    provider: 'ngrok',
    trustProxy: true,
  });
  assert.strictEqual(
    invalidFirstForwardedNonLoopback.identity,
    'tunnel:ngrok:unknown',
    'trusted tunnel mode should fall back to shared identity after invalid first forwarded value even when socket is not loopback',
  );
  assert.strictEqual(
    invalidFirstForwardedNonLoopback.whitelistEligible,
    false,
    'trusted tunnel invalid-XFF non-loopback fallback should not be whitelist-eligible',
  );

  const missingForwarded = resolveAuthClientIdentity(req('127.0.0.1'), {
    accessMode: 'ngrok',
    provider: 'ngrok',
    trustProxy: true,
  });
  assert.strictEqual(
    missingForwarded.identity,
    'tunnel:ngrok:unknown',
    'trusted tunnel mode should fall back to shared identity when forwarded client IP is absent',
  );
  assert.strictEqual(missingForwarded.whitelistEligible, false, 'shared tunnel fallback should not be whitelist-eligible');

  const missingForwardedNonLoopback = resolveAuthClientIdentity(req('198.51.100.7'), {
    accessMode: 'ngrok',
    provider: 'ngrok',
    trustProxy: true,
  });
  assert.strictEqual(
    missingForwardedNonLoopback.identity,
    'tunnel:ngrok:unknown',
    'trusted tunnel mode should fall back to shared identity without forwarded client IP even when socket is not loopback',
  );
  assert.strictEqual(
    missingForwardedNonLoopback.whitelistEligible,
    false,
    'trusted tunnel missing-XFF non-loopback fallback should not be whitelist-eligible',
  );
}

function checkStableBanIdentity() {
  const first = resolveAuthClientIdentity(req('127.0.0.1'), {
    accessMode: 'ngrok',
    provider: 'ngrok',
    trustProxy: false,
  });
  const second = resolveAuthClientIdentity(req('127.0.0.1'), {
    accessMode: 'ngrok',
    provider: 'ngrok',
    trustProxy: false,
  });
  const banned = new Map();
  banned.set(first.identity, Date.now() + 60_000);
  assert.strictEqual(
    banned.has(second.identity),
    true,
    'ban lookup and auth-failure recording should use the same stable resolved identity string',
  );
}

checkDirectIdentity();
checkPublicProxyTrust();
checkTunnelSharedIdentity();
checkTunnelTrustedForwardedIdentity();
checkStableBanIdentity();

console.log('access auth IP regression checks passed');
