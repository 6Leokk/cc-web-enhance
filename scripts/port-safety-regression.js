#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const serverJs = fs.readFileSync(path.join(root, 'server.js'), 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(
  /const\s+ALLOW_PORT_KILL\s*=\s*process\.env\.CC_WEB_KILL_PORT_OCCUPANT\s*===\s*['"]1['"]/.test(serverJs),
  'server should keep an explicit env gate for aggressive port killing',
);

assert(
  /function\s+killOwnedPortOccupant\s*\(port\)/.test(serverJs),
  'server should have a dedicated helper that only reclaims ports from stale cc-web instances',
);

assert(
  /if\s*\(killOwnedPortOccupant\(PORT\)\s*\|\|\s*\(ALLOW_PORT_KILL\s*&&\s*killPortOccupant\(PORT\)\)\)/.test(serverJs),
  'EADDRINUSE handling should first reclaim only owned cc-web occupants, and only fall back to broad killing when explicitly enabled',
);

assert(
  /function\s+isOwnedPortOccupant\s*\(pid\)/.test(serverJs) &&
    /__filename/.test(serverJs),
  'owned-port detection should verify the occupant belongs to this server.js instance before killing it',
);

console.log('port safety regression checks passed');
