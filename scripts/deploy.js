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
    reconfigure: false,
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
    else if (item === '--reconfigure') options.reconfigure = true;
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

function hasMissingDeps(cwd) {
  const pkgPath = path.join(cwd, 'package.json');
  if (!fs.existsSync(pkgPath)) return false;
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  for (const depName of Object.keys(deps)) {
    const pkgJson = path.join(cwd, 'node_modules', depName, 'package.json');
    if (!fs.existsSync(pkgJson)) return true;
  }
  return false;
}

async function runDeploy(options = {}) {
  const cwd = options.cwd || REPO_ROOT;
  const envPath = path.join(cwd, '.env');
  const examplePath = path.join(cwd, '.env.example');
  const envExists = fs.existsSync(envPath);
  const exampleExists = fs.existsSync(examplePath);

  const envIsUnconfigured = envExists && exampleExists
    && fs.readFileSync(envPath, 'utf8') === fs.readFileSync(examplePath, 'utf8');

  // Detect broken config: mode is set but required secrets are missing or corrupted
  let fileEnv = readEnvFile(envPath);
  const modeNeedsToken = fileEnv.CC_WEB_ACCESS_MODE === 'ngrok' && (!fileEnv.NGROK_AUTHTOKEN || fileEnv.NGROK_AUTHTOKEN.includes('*'));
  const modeNeedsFrpServer = fileEnv.CC_WEB_ACCESS_MODE === 'frp' && !fileEnv.FRP_SERVER_ADDR;
  const envIsBroken = envExists && (modeNeedsToken || modeNeedsFrpServer);

  // reconfigure is for config changes only — skip reset, don't remove anything
  if (options.reconfigure) options.reset = false;

  if ((options.reconfigure || !envExists || envIsUnconfigured || envIsBroken) && !options.nonInteractive && process.stdin.isTTY) {
    try {
      const wizardEnv = await runSetupWizard(options);
      if (wizardEnv) {
        if (exampleExists && (!envExists || envIsBroken)) {
          fs.copyFileSync(examplePath, envPath);
        }
        writeEnvFile(envPath, wizardEnv);
      }
    } catch (err) {
      console.error(`\n[deploy] Setup wizard failed: ${err.message}`);
      console.error('[deploy] Run deploy.js again or edit .env manually.\n');
      process.exit(1);
    }
  }

  fileEnv = readEnvFile(envPath);

  // Detect stale node_modules: package.json has new deps not yet installed.
  // Without this, `npm install` may say "up to date" and skip installing
  // newly added dependencies when the lockfile is outdated.
  const nmPath = path.join(cwd, 'node_modules');
  if (fs.existsSync(nmPath) && !options.skipInstall && hasMissingDeps(cwd)) {
    console.warn('\n[deploy] Dependencies changed since last install. Removing node_modules for clean reinstall...');
    fs.rmSync(nmPath, { recursive: true, force: true });
  }

  const mergedEnv = { ...process.env, ...fileEnv };
  const withFrp = options.withFrp === null || options.withFrp === undefined
    ? isFrpRequested(mergedEnv)
    : !!options.withFrp;
  const plan = buildDeployPlan({
    ...options,
    withFrp,
    envExists: fs.existsSync(envPath),
  });

  let ranNpmInstall = false;
  for (const warning of plan.warnings) console.warn(`[deploy] ${warning}`);
  for (const step of plan.steps) {
    if (step.type === 'file-copy') runFileCopy(step, { cwd });
    else if (step.type === 'remove-path') runRemovePath(step, { cwd });
    else {
      if (step.id === 'npm-install') ranNpmInstall = true;
      runCommand(step, { cwd });
    }
  }

  // After npm install, verify dependencies are actually present.
  // Stale lockfiles or mirror issues can leave deps missing even when npm exits 0.
  if (ranNpmInstall && !options.skipInstall && hasMissingDeps(cwd)) {
    console.warn('\n[deploy] Dependencies missing — node_modules is stale. Force-cleaning and reinstalling...');
    const nodeModulesPath = resolveRepoTarget(cwd, 'node_modules');
    fs.rmSync(nodeModulesPath, { recursive: true, force: true });
    const reinstallArgs = ['install'];
    const npmRegistry = options.npmRegistry || '';
    if (npmRegistry) reinstallArgs.push(`--registry=${npmRegistry}`);
    runCommand({
      id: 'npm-install-fix',
      type: 'command',
      command: 'npm',
      args: reinstallArgs,
      env: {},
      message: 'Reinstall dependencies (force clean)',
    }, { cwd });
    if (hasMissingDeps(cwd)) {
      console.error('[deploy] ERROR: dependencies still missing after forced reinstall. Check your network / npm registry.\n');
      process.exit(1);
    }
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

function hiddenQuestion(rl, promptText) {
  // On Windows PowerShell the terminal echo bypasses _writeToOutput,
  // causing interleaved * and characters. Use plain question() instead
  // — this is a local setup wizard, not a login screen.
  return question(rl, promptText);
}

const WIZARD_I18N = {
  langTitle: '\n[deploy] === Select Language / 选择语言 ===',
  langPrompt: '  [1] English    [2] 中文     (default: 2): ',
  en: {
    title: '\n[deploy] === cc-web interactive setup ===',
    proceed: '\nConfigure cc-web now? [Y/n]: ',
    skipped: '[deploy] Skipping setup wizard. Using defaults.\n',
    modesTitle: '\nAccess modes:',
    mode1: '  1. direct  — local browser only (default)',
    mode2: '  2. ngrok   — public access via ngrok tunnel',
    mode3: '  3. frp     — self-hosted frp tunnel',
    mode4: '  4. public  — behind a reverse proxy with a known public URL',
    modeAsk: '\nSelect access mode [1/2/3/4] (default: 1): ',
    ngrokTitle: '\n--- ngrok configuration ---',
    ngrokHint: 'Get your authtoken from https://dashboard.ngrok.com/get-started/your-authtoken',
    ngrokToken: 'ngrok authtoken (required): ',
    ngrokTokenErr: 'ngrok authtoken is required for ngrok mode',
    ngrokDomain: 'ngrok domain (optional, press Enter to skip): ',
    ngrokAuth: 'ngrok basic auth user:pass (optional, press Enter to skip): ',
    frpTitle: '\n--- frp configuration ---',
    frpServer: 'FRP server address (required): ',
    frpServerErr: 'FRP server address is required for frp mode',
    frpPort: 'FRP server port [7000]: ',
    frpToken: 'FRP token (required): ',
    frpTokenErr: 'FRP token is required for frp mode',
    frpPublicPort: 'FRP public port (optional): ',
    frpDomain: 'FRP custom domain (optional, press Enter to skip): ',
    publicTitle: '\n--- public mode ---',
    publicUrl: 'Public URL (required, e.g. https://cc.example.com): ',
    publicUrlErr: 'Public URL is required for public mode',
    directTitle: '\n--- direct mode ---',
    directScope: 'Scope: local (this machine only) or lan (local network)? [local/lan] (default: local): ',
    password: '\nWeb login password (leave empty for random): ',
    port: 'Listen port [8083]: ',
    done: '\n[deploy] Configuration complete.\n',
  },
  zh: {
    title: '\n[deploy] === cc-web 交互式配置 ===',
    proceed: '\n是否现在配置 cc-web？[Y/n]: ',
    skipped: '[deploy] 跳过配置向导，使用默认设置。\n',
    modesTitle: '\n访问模式:',
    mode1: '  1. direct  — 仅本机浏览器访问（默认）',
    mode2: '  2. ngrok   — 通过 ngrok 隧道公网访问（推荐大陆用户）',
    mode3: '  3. frp     — 自托管 frp 内网穿透',
    mode4: '  4. public  — 反向代理，已有公网域名',
    modeAsk: '\n选择访问模式 [1/2/3/4] (默认: 1): ',
    ngrokTitle: '\n--- ngrok 配置 ---',
    ngrokHint: '从 https://dashboard.ngrok.com/get-started/your-authtoken 获取你的 authtoken',
    ngrokToken: 'ngrok authtoken（必填）: ',
    ngrokTokenErr: 'ngrok 模式必须提供 authtoken',
    ngrokDomain: 'ngrok 域名（可选，回车跳过）: ',
    ngrokAuth: 'ngrok 基础认证 user:pass（可选，回车跳过）: ',
    frpTitle: '\n--- frp 配置 ---',
    frpServer: 'FRP 服务器地址（必填）: ',
    frpServerErr: 'frp 模式必须提供服务器地址',
    frpPort: 'FRP 服务器端口 [7000]: ',
    frpToken: 'FRP 令牌（必填）: ',
    frpTokenErr: 'frp 模式必须提供令牌',
    frpPublicPort: 'FRP 公网端口（可选）: ',
    frpDomain: 'FRP 自定义域名（可选，回车跳过）: ',
    publicTitle: '\n--- 公网模式 ---',
    publicUrl: '公网 URL（必填，如 https://cc.example.com）: ',
    publicUrlErr: '公网模式必须提供 URL',
    directTitle: '\n--- 本机模式 ---',
    directScope: '范围: local（仅本机）还是 lan（局域网）? [local/lan] (默认: local): ',
    password: '\nWeb 登录密码（留空则自动生成随机密码）: ',
    port: '监听端口 [8083]: ',
    done: '\n[deploy] 配置完成。\n',
  },
};

async function runSetupWizard(options = {}) {
  const env = {};
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  try {
    console.log(WIZARD_I18N.langTitle);
    const langChoice = await question(rl, WIZARD_I18N.langPrompt);
    const lang = langChoice === '1' ? 'en' : 'zh';
    const t = WIZARD_I18N[lang];

    console.log(t.title);

    const proceed = await question(rl, t.proceed);
    if (proceed && proceed.toLowerCase() !== 'y' && proceed.toLowerCase() !== 'yes') {
      console.log(t.skipped);
      return null;
    }

    console.log(t.modesTitle);
    console.log(t.mode1);
    console.log(t.mode2);
    console.log(t.mode3);
    console.log(t.mode4);
    const modeChoice = await question(rl, t.modeAsk);

    if (modeChoice === '2') {
      env.CC_WEB_ACCESS_MODE = 'ngrok';
      console.log(t.ngrokTitle);
      console.log(t.ngrokHint);
      const token = await hiddenQuestion(rl, t.ngrokToken);
      if (!token) throw new Error(t.ngrokTokenErr);
      env.NGROK_AUTHTOKEN = token;
      env.NGROK_AUTO_START = '1';
    } else if (modeChoice === '3') {
      env.CC_WEB_ACCESS_MODE = 'frp';
      console.log(t.frpTitle);
      const serverAddr = await question(rl, t.frpServer);
      if (!serverAddr) throw new Error(t.frpServerErr);
      env.FRP_MODE = 'client';
      env.FRP_SERVER_ADDR = serverAddr;
      const serverPort = await question(rl, t.frpPort);
      env.FRP_SERVER_PORT = serverPort || '7000';
      const token = await hiddenQuestion(rl, t.frpToken);
      if (!token) throw new Error(t.frpTokenErr);
      env.FRP_TOKEN = token;
      const publicPort = await question(rl, t.frpPublicPort);
      if (publicPort) env.FRP_PUBLIC_PORT = publicPort;
      const domain = await question(rl, t.frpDomain);
      if (domain) env.FRP_CUSTOM_DOMAIN = domain;
      env.FRP_LOCAL_IP = '127.0.0.1';
      env.FRP_LOCAL_PORT = '8083';
      env.FRP_AUTO_START = '1';
    } else if (modeChoice === '4') {
      env.CC_WEB_ACCESS_MODE = 'public';
      console.log(t.publicTitle);
      const publicUrl = await question(rl, t.publicUrl);
      if (!publicUrl) throw new Error(t.publicUrlErr);
      env.CC_WEB_PUBLIC_URL = publicUrl;
    } else {
      env.CC_WEB_ACCESS_MODE = 'direct';
      console.log(t.directTitle);
      const scope = await question(rl, t.directScope);
      env.CC_WEB_DIRECT_SCOPE = (scope && scope.toLowerCase() === 'lan') ? 'lan' : 'local';
    }

    const password = await question(rl, t.password);
    if (password) env.CC_WEB_PASSWORD = password;

    const port = await question(rl, t.port);
    if (port) env.CC_WEB_PORT = port;

    console.log(t.done);
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
    const pattern = new RegExp(`^#?[^\\S\\n]*${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}=.*`, 'm');
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
  --reconfigure                 Force the setup wizard even if .env already exists
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
