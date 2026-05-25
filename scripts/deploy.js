#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline');
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
    reset: true,
    nonInteractive: false,
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
    else if (item === '--non-interactive') options.nonInteractive = true;
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

async function runDeploy(options = {}) {
  const cwd = options.cwd || REPO_ROOT;
  const envPath = path.join(cwd, '.env');
  const envExists = fs.existsSync(envPath);

  if (!envExists && !options.nonInteractive && process.stdin.isTTY) {
    try {
      const wizardEnv = await runSetupWizard(options);
      if (wizardEnv) {
        const sourcePath = path.join(cwd, '.env.example');
        if (fs.existsSync(sourcePath)) {
          fs.copyFileSync(sourcePath, envPath);
        }
        writeEnvFile(envPath, wizardEnv);
      }
    } catch (err) {
      console.error(`\n[deploy] Setup wizard failed: ${err.message}`);
      console.error('[deploy] Run deploy.js again or edit .env manually.\n');
      process.exit(1);
    }
  }

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

function question(rl, promptText) {
  return new Promise((resolve) => {
    rl.question(promptText, (answer) => resolve(String(answer || '').trim()));
  });
}

function hiddenQuestion(promptText) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    });
    const originalWrite = rl._writeToOutput;
    rl._writeToOutput = function writeHidden(text) {
      if (String(text).includes(promptText)) {
        originalWrite.call(rl, text);
      } else {
        originalWrite.call(rl, '*');
      }
    };
    rl.question(promptText, (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(String(answer || '').trim());
    });
  });
}

async function runSetupWizard(options = {}) {
  const env = {};
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  try {
    console.log('\n[deploy] === cc-web interactive setup ===\n');

    const proceed = await question(rl, 'Configure cc-web now? [Y/n]: ');
    if (proceed && proceed.toLowerCase() !== 'y' && proceed.toLowerCase() !== 'yes') {
      console.log('[deploy] Skipping setup wizard. Using .env.example defaults.\n');
      return null;
    }

    // Access mode
    console.log('\nAccess modes:');
    console.log('  1. direct  — local browser only (default)');
    console.log('  2. ngrok   — public access via ngrok tunnel (best for mainland China)');
    console.log('  3. frp     — self-hosted frp tunnel');
    console.log('  4. public  — behind a reverse proxy with a known public URL');
    const modeChoice = await question(rl, '\nSelect access mode [1/2/3/4] (default: 1): ');

    if (modeChoice === '2') {
      env.CC_WEB_ACCESS_MODE = 'ngrok';
      console.log('\n--- ngrok configuration ---');
      console.log('Get your authtoken from https://dashboard.ngrok.com/get-started/your-authtoken');
      const token = await hiddenQuestion('ngrok authtoken (required): ');
      if (!token) throw new Error('ngrok authtoken is required for ngrok mode');
      env.NGROK_AUTHTOKEN = token;
      const domain = await question(rl, 'ngrok domain (optional, press Enter to skip): ');
      if (domain) env.NGROK_DOMAIN = domain;
      const basicAuth = await question(rl, 'ngrok basic auth user:pass (optional, press Enter to skip): ');
      if (basicAuth) env.NGROK_BASIC_AUTH = basicAuth;
      env.NGROK_AUTO_START = '1';
    } else if (modeChoice === '3') {
      env.CC_WEB_ACCESS_MODE = 'frp';
      console.log('\n--- frp configuration ---');
      const serverAddr = await question(rl, 'FRP server address (required): ');
      if (!serverAddr) throw new Error('FRP server address is required for frp mode');
      env.FRP_MODE = 'client';
      env.FRP_SERVER_ADDR = serverAddr;
      const serverPort = await question(rl, 'FRP server port [7000]: ');
      env.FRP_SERVER_PORT = serverPort || '7000';
      const token = await hiddenQuestion('FRP token (required): ');
      if (!token) throw new Error('FRP token is required for frp mode');
      env.FRP_TOKEN = token;
      const publicPort = await question(rl, 'FRP public port (optional): ');
      if (publicPort) env.FRP_PUBLIC_PORT = publicPort;
      const domain = await question(rl, 'FRP custom domain (optional, press Enter to skip): ');
      if (domain) env.FRP_CUSTOM_DOMAIN = domain;
      env.FRP_LOCAL_IP = '127.0.0.1';
      env.FRP_LOCAL_PORT = '8083';
      env.FRP_AUTO_START = '1';
    } else if (modeChoice === '4') {
      env.CC_WEB_ACCESS_MODE = 'public';
      console.log('\n--- public mode ---');
      const publicUrl = await question(rl, 'Public URL (required, e.g. https://cc.example.com): ');
      if (!publicUrl) throw new Error('Public URL is required for public mode');
      env.CC_WEB_PUBLIC_URL = publicUrl;
    } else {
      env.CC_WEB_ACCESS_MODE = 'direct';
      console.log('\n--- direct mode ---');
      const scope = await question(rl, 'Scope: local (this machine only) or lan (local network)? [local/lan] (default: local): ');
      env.CC_WEB_DIRECT_SCOPE = (scope && scope.toLowerCase() === 'lan') ? 'lan' : 'local';
    }

    // Password
    const password = await question(rl, '\nWeb login password (leave empty for random): ');
    if (password) env.CC_WEB_PASSWORD = password;

    // Port
    const port = await question(rl, 'Listen port [8083]: ');
    if (port) env.CC_WEB_PORT = port;

    console.log('\n[deploy] Configuration complete.\n');
    return env;
  } finally {
    rl.close();
  }
}

function writeEnvFile(filePath, values) {
  const envPath = path.resolve(filePath);
  let content = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';

  for (const [key, value] of Object.entries(values)) {
    if (value === undefined || value === null) continue;
    const pattern = new RegExp(`^#?\\s*${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}=.*`, 'm');
    const replacement = `${key}=${value}`;
    if (pattern.test(content)) {
      content = content.replace(pattern, replacement);
    } else {
      if (content && !content.endsWith('\n')) content += '\n';
      content += `${replacement}\n`;
    }
  }

  fs.writeFileSync(envPath, content, 'utf8');
  console.log(`[deploy] Wrote configuration to ${envPath}`);
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
  --non-interactive             Skip interactive setup wizard (for CI/automation)
  --npm-registry <url>          Override per-command npm registry
  --github-proxy-base <url>     Prefix GitHub release asset downloads
  --frp-download-base-url <url> Use <base>/v<version>/<asset> for frp downloads
  --frp-download-url <url>      Use a full frp archive URL
  --frp-download-sha256 <hex>   Required for direct frp mirror downloads
  --frp-version <version>       frp version for direct mirror downloads
`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }
  await runDeploy(options);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(`[deploy] ${err.stack || err.message}`);
    process.exit(1);
  });
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
