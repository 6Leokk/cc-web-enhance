#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const regressionJs = fs.readFileSync(path.join(root, 'scripts', 'regression.js'), 'utf8');
const scriptsDir = path.join(root, 'scripts');

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

assert(
  !regressionJs.includes("serverUrl: 'https://api.day.app'"),
  'full regression should not configure Bark with the public default endpoint',
);

for (const filename of fs.readdirSync(scriptsDir)) {
  if (!filename.endsWith('.js')) continue;
  const source = fs.readFileSync(path.join(scriptsDir, filename), 'utf8');
  if (!/spawn\(process\.execPath,\s*\[SERVER_PATH\]/.test(source)) continue;
  assert(
    /HOME:\s*[^,\n}]+/.test(source),
    `${filename} should isolate HOME when spawning the server`,
  );
  assert(
    /USERPROFILE:\s*[^,\n}]+/.test(source),
    `${filename} should isolate USERPROFILE when spawning the server`,
  );
}

console.log('regression harness checks passed');
