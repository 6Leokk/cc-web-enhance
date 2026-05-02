#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const serverJs = fs.readFileSync(path.join(root, 'server.js'), 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(
  /const\s+TRUST_PROXY\s*=\s*process\.env\.CC_WEB_TRUST_PROXY\s*===\s*['"]1['"]/.test(serverJs),
  'server should gate forwarded-IP trust behind CC_WEB_TRUST_PROXY=1',
);

assert(
  /function\s+getClientIP\s*\(req\)/.test(serverJs),
  'server should resolve client IP through a dedicated helper',
);

assert(
  /if\s*\(!TRUST_PROXY\)\s*return\s+remoteAddress;/.test(serverJs),
  'default client IP resolution should ignore X-Forwarded-For and use the socket remote address',
);

assert(
  /const\s+clientIP\s*=\s*getClientIP\(req\)/.test(serverJs),
  'WebSocket auth and ban flow should use the centralized client-IP helper',
);

assert(
  !/const\s+forwarded\s*=\s*req\.headers\['x-forwarded-for'\]/.test(serverJs),
  'WebSocket auth path should not read X-Forwarded-For directly anymore',
);

console.log('auth IP regression checks passed');
