#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const regressionJs = fs.readFileSync(path.join(root, 'scripts', 'regression.js'), 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(
  !regressionJs.includes("spawn('/usr/bin/node'"),
  'regression harness should not hardcode /usr/bin/node',
);

assert(
  /spawn\(process\.execPath,\s*\[SERVER_PATH\]/.test(regressionJs),
  'regression harness should spawn the same Node binary as the current process',
);

console.log('regression harness checks passed');
