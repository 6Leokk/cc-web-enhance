#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const frpDownload = require('./frp-download');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function read(filePath) {
  return fs.readFileSync(path.join(root, filePath), 'utf8');
}

function checkDownloadHelpers() {
  assert(
    frpDownload.normalizeTargetArch('linux-amd64') === 'linux_amd64',
    'linux-amd64 should map to frp linux_amd64 suffix',
  );
  assert(
    frpDownload.normalizeTargetArch('darwin-arm64') === 'darwin_arm64',
    'darwin-arm64 should map to frp darwin_arm64 suffix',
  );
  assert(
    frpDownload.assetNameFor({ version: '0.68.1', targetArch: 'linux_amd64' }) === 'frp_0.68.1_linux_amd64.tar.gz',
    'linux asset name should match official frp release naming',
  );
  assert(
    frpDownload.assetNameFor({ version: '0.68.1', targetArch: 'windows_amd64' }) === 'frp_0.68.1_windows_amd64.zip',
    'windows asset name should use zip',
  );
}

function checkGitignore() {
  const gitignore = read('.gitignore');
  for (const pattern of ['frp/bin/*', 'frp/conf/*', 'frp/logs/*', 'frp/run/*', 'frp/tmp/*']) {
    assert(gitignore.includes(pattern), `.gitignore should ignore ${pattern}`);
  }
}

function checkPackageScripts() {
  const pkg = JSON.parse(read('package.json'));
  assert(pkg.scripts['frp:download'] === 'node scripts/frp-download.js', 'package should expose frp:download');
}

checkDownloadHelpers();
checkGitignore();
checkPackageScripts();

console.log('frp builtin regression checks passed');
