#!/usr/bin/env node

const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.resolve(__dirname, '..');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertIncludes(haystack, needle, message) {
  assert(String(haystack).includes(needle), `${message}: missing ${needle}`);
}

function assertNotIncludes(haystack, needle, message) {
  assert(!String(haystack).includes(needle), `${message}: found forbidden value ${needle}`);
}

function read(filePath) {
  return fs.readFileSync(path.join(root, filePath), 'utf8');
}

function checkDeployPlanner() {
  const deploy = require('./deploy');

  const globalPlan = deploy.buildDeployPlan({
    profile: 'global',
    withFrp: true,
    start: false,
    envExists: true,
  });
  const globalInstall = globalPlan.steps.find((step) => step.id === 'npm-install');
  assertEqual(globalInstall.command, 'npm', 'global profile should run npm directly');
  assertEqual(globalInstall.args.join(' '), 'install', 'global profile should not force a registry');

  const cnPlan = deploy.buildDeployPlan({
    profile: 'cn',
    withFrp: true,
    start: true,
    envExists: false,
  });
  const cnInstall = cnPlan.steps.find((step) => step.id === 'npm-install');
  assertEqual(cnInstall.command, 'npm', 'cn profile should run npm directly');
  assertIncludes(
    cnInstall.args.join(' '),
    '--registry=https://registry.npmmirror.com',
    'cn profile should use a per-command npm registry flag',
  );
  assertNotIncludes(
    cnPlan.steps.map((step) => [step.command, ...(step.args || [])].join(' ')).join('\n'),
    'npm config',
    'deploy scripts must not mutate host npm configuration',
  );

  const ensureEnv = cnPlan.steps.find((step) => step.id === 'ensure-env');
  assert(ensureEnv, 'deploy plan should create .env when it is missing');

  const frpDownload = cnPlan.steps.find((step) => step.id === 'frp-download');
  assert(frpDownload, 'withFrp should include frp download step');
  assertEqual(
    frpDownload.env.FRP_DOWNLOAD_GITHUB_PROXY_BASE,
    'https://gh-proxy.com/',
    'cn frp download should default to the mainland download proxy',
  );

  const start = cnPlan.steps.find((step) => step.id === 'start');
  assert(start, 'start=true should include npm start step');

  const resetPlan = deploy.buildDeployPlan({
    profile: 'cn',
    withFrp: true,
    start: true,
    reset: true,
    envExists: false,
  });
  const resetIds = resetPlan.steps.map((step) => step.id);
  assert(resetIds.includes('reset-node-modules'), 'reset plan should clear node_modules');
  assert(resetIds.includes('reset-frp-bin'), 'reset plan should clear frp bin cache');
  assert(resetIds.includes('reset-frp-tmp'), 'reset plan should clear frp temp cache');
  assert(
    resetIds.indexOf('reset-node-modules') < resetIds.indexOf('npm-install'),
    'reset plan should clear node_modules before reinstall',
  );
}

function checkFrpDownloadHelpers() {
  const frpDownload = require('./frp-download');
  assertEqual(
    frpDownload.applyDownloadUrlPrefix(
      'https://github.com/fatedier/frp/releases/download/v0.68.1/frp_0.68.1_linux_amd64.tar.gz',
      'https://gh-proxy.com/',
    ),
    'https://gh-proxy.com/https://github.com/fatedier/frp/releases/download/v0.68.1/frp_0.68.1_linux_amd64.tar.gz',
    'github proxy prefix should wrap the original download URL',
  );
  assertEqual(
    frpDownload.buildMirrorAssetUrl({
      baseUrl: 'https://mirror.example/frp',
      version: '0.68.1',
      assetName: 'frp_0.68.1_linux_amd64.tar.gz',
    }),
    'https://mirror.example/frp/v0.68.1/frp_0.68.1_linux_amd64.tar.gz',
    'mirror URL should follow <base>/v<version>/<asset>',
  );
}

function checkResetRunRemovesArtifacts() {
  const deploy = require('./deploy');
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-web-deploy-reset-'));
  try {
    fs.mkdirSync(path.join(tempRoot, 'node_modules', 'stale-package'), { recursive: true });
    fs.mkdirSync(path.join(tempRoot, 'frp', 'bin'), { recursive: true });
    fs.mkdirSync(path.join(tempRoot, 'frp', 'tmp', 'download-1'), { recursive: true });
    fs.writeFileSync(path.join(tempRoot, 'node_modules', 'stale-package', 'index.js'), '');
    fs.writeFileSync(path.join(tempRoot, 'frp', 'bin', 'frpc'), '');
    fs.writeFileSync(path.join(tempRoot, 'frp', 'tmp', 'download-1', 'archive.tar.gz'), '');
    fs.writeFileSync(path.join(tempRoot, '.env.example'), 'CC_WEB_PORT=8083\n');

    deploy.runDeploy({
      cwd: tempRoot,
      profile: 'global',
      reset: true,
      skipInstall: true,
      withFrp: false,
      start: false,
    });

    assert(!fs.existsSync(path.join(tempRoot, 'node_modules')), 'reset run should remove node_modules');
    assert(!fs.existsSync(path.join(tempRoot, 'frp', 'bin')), 'reset run should remove frp/bin');
    assert(!fs.existsSync(path.join(tempRoot, 'frp', 'tmp')), 'reset run should remove frp/tmp');
    assert(fs.existsSync(path.join(tempRoot, '.env')), 'reset run should keep normal deploy file creation');
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

function checkWrappersAndDocs() {
  for (const filePath of [
    'scripts/deploy/linux-global.sh',
    'scripts/deploy/linux-cn.sh',
    'scripts/deploy/macos-global.sh',
    'scripts/deploy/macos-cn.sh',
    'scripts/deploy/windows-global.cmd',
    'scripts/deploy/windows-cn.cmd',
  ]) {
    const content = read(filePath);
    assertIncludes(content, 'scripts/deploy.js', `${filePath} should call the shared deploy core`);
    assertNotIncludes(content, '--reset', `${filePath} should not hardcode --reset (default is in deploy.js)`);
    assertNotIncludes(content, 'npm config', `${filePath} should not mutate npm config`);
  }

  const cnLinux = read('scripts/deploy/linux-cn.sh');
  assertIncludes(cnLinux, '--profile cn', 'linux-cn wrapper should use cn profile');

  const globalWindows = read('scripts/deploy/windows-global.cmd');
  assertIncludes(globalWindows, '--profile global', 'windows-global wrapper should use global profile');

  const pkg = JSON.parse(read('package.json'));
  assertEqual(pkg.scripts['deploy:global'], 'node scripts/deploy.js --profile global --reset', 'package should expose global deploy script');
  assertEqual(pkg.scripts['deploy:cn'], 'node scripts/deploy.js --profile cn --reset', 'package should expose cn deploy script');

  const readme = read('README.md');
  assertIncludes(readme, 'npm install --registry=https://registry.npmmirror.com', 'README should document per-command mainland npm registry');
  assertIncludes(readme, 'scripts/deploy/linux-cn.sh', 'README should document mainland Linux deploy wrapper');
  assertIncludes(readme, 'scripts\\deploy\\windows-cn.cmd', 'README should document mainland Windows deploy wrapper');
  assertIncludes(readme, '--reset', 'README should document clean rebuild deployment');
}

function checkMainlandBootstrapInstaller() {
  const installer = read('scripts/install-cn.sh');

  assertIncludes(installer, 'set -euo pipefail', 'installer should use strict shell mode');
  assertIncludes(installer, 'DEFAULT_INSTALL_DIR="/opt/cc-web-enhance"', 'installer should have a stable default install directory');
  assertIncludes(installer, 'https://github.com/6Leokk/cc-web-enhance.git', 'installer should clone the enhanced repository');
  assertIncludes(installer, 'DEFAULT_BRANCH="main"', 'installer should install the GitHub default branch by default');
  assertIncludes(installer, 'pull --ff-only', 'installer should update existing checkouts without rewriting local changes');
  assertIncludes(installer, 'checkout --track "origin/$BRANCH"', 'installer should create a missing local branch from origin');
  assertIncludes(installer, 'scripts/deploy/linux-cn.sh', 'installer should delegate dependency setup to the cn deploy wrapper');
  assertIncludes(installer, '--start', 'installer should expose a start option');
  assertIncludes(installer, '--with-frp', 'installer should expose a frp option');
  assertIncludes(installer, '--no-reset', 'installer should expose a no-reset option');
  assertNotIncludes(installer, 'npm config set', 'installer must not mutate host npm configuration');
  assertNotIncludes(installer, 'apt install', 'installer should not install system packages implicitly');

  const readme = read('README.md');
  assertIncludes(readme, 'scripts/install-cn.sh', 'README should document the copy-paste mainland installer');
  assertIncludes(readme, '/opt/cc-web-enhance', 'README should document where the installer puts the app');
  assertIncludes(readme, '| CC_WEB_INSTALL_DIR=/data/cc-web-enhance bash -s -- --start', 'README should pass install directory override to bash, not curl');
}

function checkWindowsBootstrapInstaller() {
  const installer = read('scripts/install-cn.ps1');

  assertIncludes(installer, '$ErrorActionPreference = \'Stop\'', 'windows installer should stop on errors');
  assertIncludes(installer, '$DefaultInstallDir = Join-Path $env:LOCALAPPDATA \'cc-web-enhance\'', 'windows installer should default to a per-user writable install directory');
  assertIncludes(installer, 'https://github.com/6Leokk/cc-web-enhance.git', 'windows installer should clone the enhanced repository');
  assertIncludes(installer, '$DefaultBranch = \'main\'', 'windows installer should install the GitHub default branch by default');
  assertIncludes(installer, 'pull --ff-only', 'windows installer should update existing checkouts without rewriting local changes');
  assertIncludes(installer, 'checkout --track "origin/$Branch"', 'windows installer should create a missing local branch from origin');
  assertIncludes(installer, 'scripts\\deploy\\windows-cn.cmd', 'windows installer should delegate dependency setup to the cn Windows deploy wrapper');
  assertIncludes(installer, '-Start', 'windows installer should expose a start option');
  assertIncludes(installer, '-WithFrp', 'windows installer should expose a frp option');
  assertIncludes(installer, '-NoReset', 'windows installer should expose a no-reset option');
  assertIncludes(installer, "$nodeVersion = & node -p 'process.versions.node'", 'windows installer should read the Node version string without nested quoting');
  assertIncludes(installer, "[int](($nodeVersion -split '\\.')[0])", 'windows installer should parse the version in PowerShell');
  assertNotIncludes(installer, 'split(".")', 'windows installer should not pass a quoted dot through node -p');
  assertNotIncludes(installer, 'npm config set', 'windows installer must not mutate host npm configuration');

  const readme = read('README.md');
  assertIncludes(readme, 'scripts/install-cn.ps1', 'README should document the copy-paste Windows installer');
  assertIncludes(readme, '$env:LOCALAPPDATA\\cc-web-enhance', 'README should document where the Windows installer puts the app');
  assertIncludes(readme, '-InstallDir D:\\cc-web-enhance -Start', 'README should document Windows install directory override');
}

checkDeployPlanner();
checkFrpDownloadHelpers();
checkResetRunRemovesArtifacts();
checkWrappersAndDocs();
checkMainlandBootstrapInstaller();
checkWindowsBootstrapInstaller();

console.log('deploy regression checks passed');
