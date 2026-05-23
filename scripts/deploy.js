#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..');
const DEFAULT_CN_NPM_REGISTRY = 'https://registry.npmmirror.com';
const DEFAULT_CN_GITHUB_PROXY_BASE = 'https://gh-proxy.com/';

function normalizeProfile(value) {
  const profile = String(value || 'global').trim().toLowerCase();
  if (profile === 'cn' || profile === 'china' || profile === 'mainland') return 'cn';
  if (profile === 'global' || profile === 'intl' || profile === 'international') return 'global';
  throw new Error(`Unsupported deploy profile: ${value}`);
}

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  const raw = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(raw)) return true;
  if (['0', 'false', 'no', 'off'].includes(raw)) return false;
  return fallback;
}

function parseArgs(argv) {
  const options = {
    profile: 'global',
    withFrp: null,
    start: false,
    skipInstall: false,
    reset: false,
    npmRegistry: '',
    githubProxyBase: '',
    frpDownloadBaseUrl: '',
    frpDownloadUrl: '',
    frpDownloadSha256: '',
    frpVersion: '',
  };

  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    const next = argv[i + 1];
    const takeValue = () => {
      if (!next || next.startsWith('--')) throw new Error(`${item} requires a value`);
      i += 1;
      return next;
    };

    if (item === '--profile') options.profile = takeValue();
    else if (item.startsWith('--profile=')) options.profile = item.slice('--profile='.length);
    else if (item === '--with-frp') options.withFrp = true;
    else if (item === '--no-frp') options.withFrp = false;
    else if (item === '--start') options.start = true;
    else if (item === '--skip-install') options.skipInstall = true;
    else if (item === '--reset') options.reset = true;
    else if (item === '--no-reset') options.reset = false;
    else if (item === '--npm-registry') options.npmRegistry = takeValue();
    else if (item.startsWith('--npm-registry=')) options.npmRegistry = item.slice('--npm-registry='.length);
    else if (item === '--github-proxy-base') options.githubProxyBase = takeValue();
    else if (item.startsWith('--github-proxy-base=')) options.githubProxyBase = item.slice('--github-proxy-base='.length);
    else if (item === '--frp-download-base-url') options.frpDownloadBaseUrl = takeValue();
    else if (item.startsWith('--frp-download-base-url=')) options.frpDownloadBaseUrl = item.slice('--frp-download-base-url='.length);
    else if (item === '--frp-download-url') options.frpDownloadUrl = takeValue();
    else if (item.startsWith('--frp-download-url=')) options.frpDownloadUrl = item.slice('--frp-download-url='.length);
    else if (item === '--frp-download-sha256') options.frpDownloadSha256 = takeValue();
    else if (item.startsWith('--frp-download-sha256=')) options.frpDownloadSha256 = item.slice('--frp-download-sha256='.length);
    else if (item === '--frp-version') options.frpVersion = takeValue();
    else if (item.startsWith('--frp-version=')) options.frpVersion = item.slice('--frp-version='.length);
    else if (item === '--help' || item === '-h') options.help = true;
    else throw new Error(`Unknown deploy option: ${item}`);
  }

  return options;
}

function readEnvFile(filePath) {
  const env = {};
  if (!fs.existsSync(filePath)) return env;
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (!match) continue;
    env[match[1].trim()] = match[2].trim();
  }
  return env;
}

function isFrpRequested(env = {}) {
  const accessMode = String(env.CC_WEB_ACCESS_MODE || '').trim().toLowerCase();
  const frpMode = String(env.FRP_MODE || '').trim().toLowerCase();
  return accessMode === 'frp' || frpMode === 'client' || frpMode === 'server';
}

function profileDefaults(profile) {
  const normalized = normalizeProfile(profile);
  if (normalized === 'cn') {
    return {
      npmRegistry: DEFAULT_CN_NPM_REGISTRY,
      githubProxyBase: DEFAULT_CN_GITHUB_PROXY_BASE,
    };
  }
  return {
    npmRegistry: '',
    githubProxyBase: '',
  };
}

function compactEnv(env) {
  const result = {};
  for (const [key, value] of Object.entries(env || {})) {
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      result[key] = String(value).trim();
    }
  }
  return result;
}

function buildDeployPlan(options = {}) {
  const profile = normalizeProfile(options.profile);
  const defaults = profileDefaults(profile);
  const npmRegistry = String(options.npmRegistry || defaults.npmRegistry || '').trim();
  const githubProxyBase = String(options.githubProxyBase || defaults.githubProxyBase || '').trim();
  const envExists = options.envExists !== undefined
    ? !!options.envExists
    : fs.existsSync(path.join(REPO_ROOT, '.env'));

  const steps = [];
  const warnings = [];

  if (options.reset) {
    steps.push({
      id: 'reset-node-modules',
      type: 'remove-path',
      target: 'node_modules',
      message: 'Remove node_modules for a clean dependency reinstall',
    });
    steps.push({
      id: 'reset-frp-bin',
      type: 'remove-path',
      target: 'frp/bin',
      message: 'Remove downloaded frp binaries and checksums',
    });
    steps.push({
      id: 'reset-frp-tmp',
      type: 'remove-path',
      target: 'frp/tmp',
      message: 'Remove frp temporary download files',
    });
  }

  if (!envExists) {
    steps.push({
      id: 'ensure-env',
      type: 'file-copy',
      source: '.env.example',
      target: '.env',
      message: 'Create .env from .env.example',
    });
  }

  if (!options.skipInstall) {
    const args = ['install'];
    if (npmRegistry) args.push(`--registry=${npmRegistry}`);
    steps.push({
      id: 'npm-install',
      type: 'command',
      command: 'npm',
      args,
      env: {},
      message: npmRegistry
        ? `Install dependencies with per-command registry ${npmRegistry}`
        : 'Install dependencies with the default npm registry',
    });
  }

  if (options.withFrp) {
    const frpEnv = compactEnv({
      FRP_DOWNLOAD_GITHUB_PROXY_BASE: githubProxyBase,
      FRP_DOWNLOAD_BASE_URL: options.frpDownloadBaseUrl,
      FRP_DOWNLOAD_URL: options.frpDownloadUrl,
      FRP_DOWNLOAD_SHA256: options.frpDownloadSha256,
      FRP_VERSION: options.frpVersion,
    });
    if ((frpEnv.FRP_DOWNLOAD_BASE_URL || frpEnv.FRP_DOWNLOAD_URL) && !frpEnv.FRP_DOWNLOAD_SHA256) {
      warnings.push('Direct frp mirror downloads require FRP_DOWNLOAD_SHA256 for binary verification.');
    }
    steps.push({
      id: 'frp-download',
      type: 'command',
      command: 'npm',
      args: ['run', 'frp:download'],
      env: frpEnv,
      message: profile === 'cn'
        ? 'Download frp with mainland mirror/proxy environment'
        : 'Download frp from the official release path',
    });
    steps.push({
      id: 'frp-setup',
      type: 'command',
      command: 'npm',
      args: ['run', 'frp:setup'],
      env: {},
      message: 'Generate local frp config from .env',
    });
  }

  if (options.start) {
    steps.push({
      id: 'start',
      type: 'command',
      command: 'npm',
      args: ['start'],
      env: {},
      message: 'Start cc-web',
    });
  }

  return { profile, steps, warnings };
}

function runCommand(step, options = {}) {
  const cwd = options.cwd || REPO_ROOT;
  console.log(`\n[deploy] ${step.message || `${step.command} ${step.args.join(' ')}`}`);
  const result = spawnSync(step.command, step.args || [], {
    cwd,
    stdio: 'inherit',
    env: { ...process.env, ...(step.env || {}) },
    shell: process.platform === 'win32',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Command failed (${result.status}): ${step.command} ${(step.args || []).join(' ')}`);
  }
}

function runFileCopy(step, options = {}) {
  const cwd = options.cwd || REPO_ROOT;
  const source = path.join(cwd, step.source);
  const target = path.join(cwd, step.target);
  if (fs.existsSync(target)) {
    console.log(`[deploy] ${step.target} already exists; keeping existing file`);
    return;
  }
  fs.copyFileSync(source, target);
  console.log(`[deploy] Created ${step.target} from ${step.source}`);
}

function resolveRepoTarget(cwd, targetPath) {
  const root = path.resolve(cwd);
  const target = path.resolve(root, targetPath || '');
  if (target === root || !target.startsWith(`${root}${path.sep}`)) {
    throw new Error(`Refusing to remove unsafe deploy path: ${targetPath}`);
  }
  return target;
}

function runRemovePath(step, options = {}) {
  const cwd = options.cwd || REPO_ROOT;
  const target = resolveRepoTarget(cwd, step.target);
  console.log(`\n[deploy] ${step.message || `Remove ${step.target}`}`);
  fs.rmSync(target, { recursive: true, force: true });
  console.log(`[deploy] Reset ${step.target}`);
}

function runDeploy(options = {}) {
  const cwd = options.cwd || REPO_ROOT;
  const envPath = path.join(cwd, '.env');
  const fileEnv = readEnvFile(envPath);
  const mergedEnv = { ...process.env, ...fileEnv };
  const withFrp = options.withFrp === null || options.withFrp === undefined
    ? isFrpRequested(mergedEnv)
    : !!options.withFrp;
  const plan = buildDeployPlan({
    ...options,
    withFrp,
    envExists: fs.existsSync(envPath),
  });

  for (const warning of plan.warnings) console.warn(`[deploy] ${warning}`);
  for (const step of plan.steps) {
    if (step.type === 'file-copy') runFileCopy(step, { cwd });
    else if (step.type === 'remove-path') runRemovePath(step, { cwd });
    else runCommand(step, { cwd });
  }

  console.log('\n[deploy] Deployment preset finished.');
  if (!options.start) console.log('[deploy] Run npm start when you are ready to launch cc-web.');
  return plan;
}

function printHelp() {
  console.log(`Usage: node scripts/deploy.js --profile <global|cn> [options]

Options:
  --with-frp                    Download and generate frp config during deployment
  --no-frp                      Skip frp setup even if .env requests frp
  --start                       Run npm start after setup
  --skip-install                Skip npm install
  --reset                       Remove node_modules, frp/bin, and frp/tmp before setup
  --no-reset                    Keep existing install artifacts when calling deploy.js directly
  --npm-registry <url>          Override per-command npm registry
  --github-proxy-base <url>     Prefix GitHub release asset downloads
  --frp-download-base-url <url> Use <base>/v<version>/<asset> for frp downloads
  --frp-download-url <url>      Use a full frp archive URL
  --frp-download-sha256 <hex>   Required for direct frp mirror downloads
  --frp-version <version>       frp version for direct mirror downloads
`);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }
  runDeploy(options);
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error(`[deploy] ${err.stack || err.message}`);
    process.exit(1);
  }
}

module.exports = {
  DEFAULT_CN_GITHUB_PROXY_BASE,
  DEFAULT_CN_NPM_REGISTRY,
  buildDeployPlan,
  isFrpRequested,
  normalizeProfile,
  parseArgs,
  profileDefaults,
  readEnvFile,
  runDeploy,
};
