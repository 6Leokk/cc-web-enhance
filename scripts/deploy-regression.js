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
    assertIncludes(content, '--reset', `${filePath} should default to a clean rebuild`);
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

checkDeployPlanner();
checkFrpDownloadHelpers();
checkResetRunRemovesArtifacts();
checkWrappersAndDocs();

console.log('deploy regression checks passed');
