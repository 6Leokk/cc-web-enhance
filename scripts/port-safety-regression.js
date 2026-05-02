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
  'server should gate port-occupant killing behind CC_WEB_KILL_PORT_OCCUPANT=1',
);

assert(
  /if\s*\(ALLOW_PORT_KILL\s*&&\s*killPortOccupant\(PORT\)\)/.test(serverJs),
  'EADDRINUSE handling should only kill the port occupant when the explicit env flag is enabled',
);

assert(
  !/if\s*\(killPortOccupant\(PORT\)\)/.test(serverJs),
  'server should not kill unrelated port occupants by default',
);

console.log('port safety regression checks passed');
