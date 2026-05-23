#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const serverJs = fs.readFileSync(path.join(root, 'server.js'), 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(
  /resolveAccessConfig\(process\.env,\s*\{\s*configDir:\s*CONFIG_DIR\s*\}\)/.test(serverJs),
  'server should resolve access config before choosing auth identity policy',
);

assert(
  /const\s+TRUST_PROXY\s*=\s*ACCESS_CONFIG\.trustProxy/.test(serverJs),
  'server should use normalized access trustProxy config',
);

assert(
  /resolveAuthClientIdentity\(req,\s*\{/.test(serverJs),
  'WebSocket auth path should resolve mode-aware auth identity through access-auth-ip helper',
);

assert(
  /isAccessIdentityWhitelisted\(resolvedIdentity,\s*\{\s*ipWhitelist:\s*EXTRA_WHITELIST_IPS\s*\}\)/.test(serverJs),
  'auth failure path should use access identity whitelist policy',
);

assert(
  /recordAuthFailure\(authIdentity\)/.test(serverJs),
  'WebSocket auth failure path should record failures against the resolved identity object',
);

assert(
  /isBanned\(authIdentity\.identity\)/.test(serverJs),
  'WebSocket ban checks should use the resolved auth identity string',
);

assert(
  !/function\s+getClientIP\s*\(req\)/.test(serverJs),
  'server should not keep the old raw getClientIP helper after access-auth-ip integration',
);

assert(
  !/function\s+isWhitelistedIP\s*\(ip\)/.test(serverJs),
  'server should not keep the old string-only whitelist helper after access-auth-ip integration',
);

console.log('auth IP regression checks passed');
