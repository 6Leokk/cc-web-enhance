#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const regressionJs = fs.readFileSync(path.join(root, 'scripts', 'regression.js'), 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(
  /result\.error\s*&&\s*result\.error\.code\s*===\s*['"]ENOENT['"]/.test(regressionJs),
  'regression harness should detect missing sqlite3 CLI explicitly',
);

assert(
  /full regression requires the sqlite3 CLI/i.test(regressionJs),
  'regression harness should emit a clear sqlite3 dependency message',
);

console.log('sqlite3 diagnostic regression checks passed');
