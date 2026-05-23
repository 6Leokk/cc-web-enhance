#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { spawnSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..');
const MANAGED_KEYS = [
  'CC_WEB_ACCESS_MODE',
  'CC_WEB_HOST',
  'NGROK_AUTHTOKEN',
  'NGROK_DOMAIN',
  'NGROK_BASIC_AUTH',
  'NGROK_AUTO_START',
];

function parseArgs(argv = []) {
  const options = {
    start: false,
    interactive: true,
    token: '',
    domain: '',
    basicAuth: '',
  };

  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    const next = argv[i + 1];
    const takeValue = () => {
      if (!next || next.startsWith('--')) throw new Error(`${item} requires a value`);
      i += 1;
      return next;
    };

    if (item === '--start') options.start = true;
    else if (item === '--no-start') options.start = false;
    else if (item === '--non-interactive') options.interactive = false;
    else if (item === '--token') options.token = takeValue();
    else if (item.startsWith('--token=')) options.token = item.slice('--token='.length);
    else if (item === '--domain') options.domain = takeValue();
    else if (item.startsWith('--domain=')) options.domain = item.slice('--domain='.length);
    else if (item === '--basic-auth') options.basicAuth = takeValue();
    else if (item.startsWith('--basic-auth=')) options.basicAuth = item.slice('--basic-auth='.length);
    else if (item === '--help' || item === '-h') options.help = true;
    else throw new Error(`Unknown ngrok setup option: ${item}`);
  }

  return options;
}

function sanitizeEnvValue(value = '') {
  const text = String(value ?? '').trim();
  if (/[\r\n]/.test(text)) throw new Error('Environment values must be single-line strings');
  return text;
}

function isPlaceholderToken(value) {
  const text = String(value || '').trim();
  return !text || /^YOUR_?NGROK_?AUTHTOKEN$/i.test(text) || /^<.*>$/.test(text);
}

function parseEnvContent(content = '') {
  const env = {};
  for (const line of String(content || '').split(/\r?\n/)) {
    const match = line.match(/^\s*([^#=\s]+)\s*=(.*)$/);
    if (!match) continue;
    env[match[1].trim()] = String(match[2] ?? '').trim();
  }
  return env;
}

function updateEnvContent(content = '', values = {}) {
  const normalized = {};
  for (const key of MANAGED_KEYS) {
    if (Object.prototype.hasOwnProperty.call(values, key)) {
      normalized[key] = sanitizeEnvValue(values[key]);
    }
  }

  const seen = new Set();
  const lines = String(content || '').split(/\r?\n/);
  const output = [];

  for (const line of lines) {
    const match = line.match(/^\s*(?:#\s*)?([A-Za-z_][A-Za-z0-9_]*)\s*=.*$/);
    const key = match ? match[1] : '';
    if (key && Object.prototype.hasOwnProperty.call(normalized, key)) {
      if (seen.has(key)) continue;
      output.push(`${key}=${normalized[key]}`);
      seen.add(key);
      continue;
    }
    output.push(line);
  }

  const missing = MANAGED_KEYS.filter((key) => Object.prototype.hasOwnProperty.call(normalized, key) && !seen.has(key));
  if (missing.length > 0 && output.length > 0 && output[output.length - 1] !== '') output.push('');
  for (const key of missing) output.push(`${key}=${normalized[key]}`);

  return `${output.join('\n').replace(/\n+$/, '')}\n`;
}

function readSeedEnv(cwd) {
  const envPath = path.join(cwd, '.env');
  const examplePath = path.join(cwd, '.env.example');
  if (fs.existsSync(envPath)) return fs.readFileSync(envPath, 'utf8');
  if (fs.existsSync(examplePath)) return fs.readFileSync(examplePath, 'utf8');
  return '';
}

function resolveSetupValues(options = {}, existingEnv = {}, processEnv = process.env) {
  const token = sanitizeEnvValue(options.token || processEnv.NGROK_AUTHTOKEN || existingEnv.NGROK_AUTHTOKEN || '');
  const domain = sanitizeEnvValue(options.domain || processEnv.NGROK_DOMAIN || existingEnv.NGROK_DOMAIN || '');
  const basicAuth = sanitizeEnvValue(options.basicAuth || processEnv.NGROK_BASIC_AUTH || existingEnv.NGROK_BASIC_AUTH || '');

  if (isPlaceholderToken(token)) {
    throw new Error('NGROK_AUTHTOKEN is required. Run npm run start:ngrok and paste your ngrok authtoken when prompted.');
  }

  return {
    CC_WEB_ACCESS_MODE: 'ngrok',
    CC_WEB_HOST: '127.0.0.1',
    NGROK_AUTHTOKEN: token,
    NGROK_DOMAIN: domain,
    NGROK_BASIC_AUTH: basicAuth,
    NGROK_AUTO_START: '1',
  };
}

function hasUsableToken(options = {}, existingEnv = {}, processEnv = process.env) {
  return !isPlaceholderToken(options.token || processEnv.NGROK_AUTHTOKEN || existingEnv.NGROK_AUTHTOKEN || '');
}

function shouldPromptForOptionalFields(options = {}, existingEnv = {}, processEnv = process.env) {
  return !hasUsableToken(options, existingEnv, processEnv);
}

function runSetup(options = {}) {
  const cwd = options.cwd || REPO_ROOT;
  const envPath = path.join(cwd, '.env');
  const seed = readSeedEnv(cwd);
  const existingEnv = parseEnvContent(seed);
  const values = resolveSetupValues(options, existingEnv, options.processEnv || process.env);
  const content = updateEnvContent(seed, values);

  fs.writeFileSync(envPath, content);
  console.log(`[ngrok-setup] Updated ${path.relative(cwd, envPath) || '.env'} for ngrok auto-start.`);
  console.log('[ngrok-setup] Kept cc-web bound to 127.0.0.1; ngrok forwards to the local server.');

  if (!options.start) {
    console.log('[ngrok-setup] Run npm run start:ngrok to launch with ngrok, or npm start after setup.');
    return { envPath, started: false, values };
  }

  console.log('[ngrok-setup] Starting cc-web with ngrok access mode.');
  const result = spawnSync('npm', ['start'], {
    cwd,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: {
      ...process.env,
      ...values,
    },
  });
  if (result.error) throw result.error;
  if (result.status !== 0 && result.status !== null) {
    throw new Error(`npm start failed with exit code ${result.status}`);
  }
  return { envPath, started: true, values, status: result.status };
}

function createInterface(options = {}) {
  return readline.createInterface({
    input: options.input || process.stdin,
    output: options.output || process.stdout,
    terminal: options.terminal !== undefined ? options.terminal : !!process.stdout.isTTY,
  });
}

function question(rl, prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => resolve(String(answer || '').trim()));
  });
}

function hiddenQuestion(prompt) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    });
    const originalWrite = rl._writeToOutput;
    rl._writeToOutput = function writeHidden(text) {
      if (String(text).includes(prompt)) {
        originalWrite.call(rl, text);
      } else {
        originalWrite.call(rl, '*');
      }
    };
    rl.question(prompt, (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(String(answer || '').trim());
    });
  });
}

async function collectInteractiveOptions(options = {}) {
  const cwd = options.cwd || REPO_ROOT;
  const seed = readSeedEnv(cwd);
  const existing = parseEnvContent(seed);
  const promptForOptional = shouldPromptForOptionalFields(options, existing, process.env);
  const next = { ...options };

  console.log('[ngrok-setup] First-time ngrok setup');
  console.log('[ngrok-setup] Get your token from https://dashboard.ngrok.com/get-started/your-authtoken');

  if (!hasUsableToken(options, existing, process.env)) {
    next.token = await hiddenQuestion('Paste ngrok authtoken: ');
  }

  if (!promptForOptional) return next;

  const rl = createInterface();
  try {
    if (!next.domain && !existing.NGROK_DOMAIN) {
      next.domain = await question(rl, 'Reserved ngrok domain (optional, press Enter to skip): ');
    }
    if (!next.basicAuth && !existing.NGROK_BASIC_AUTH) {
      next.basicAuth = await question(rl, 'ngrok Basic Auth user:password (optional, press Enter to skip): ');
    }
  } finally {
    rl.close();
  }

  return next;
}

function printHelp() {
  console.log(`Usage: node scripts/setup-ngrok.js [options]

Options:
  --start                    Start cc-web after writing ngrok setup
  --token <token>            ngrok authtoken; avoids interactive token prompt
  --domain <domain>          Optional reserved ngrok domain
  --basic-auth <user:pass>   Optional ngrok Basic Auth
  --non-interactive          Fail instead of prompting when token is missing

Examples:
  npm run start:ngrok -- --token <token>
  npm run start:ngrok -- --token <token> --domain demo.ngrok-free.app
  NGROK_AUTHTOKEN=<token> npm run start:ngrok
`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }
  const interactive = options.interactive !== false && process.stdin.isTTY;
  const finalOptions = interactive
    ? await collectInteractiveOptions(options)
    : options;
  runSetup(finalOptions);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(`[ngrok-setup] ${err.stack || err.message}`);
    process.exit(1);
  });
}

module.exports = {
  hasUsableToken,
  isPlaceholderToken,
  parseArgs,
  parseEnvContent,
  resolveSetupValues,
  runSetup,
  shouldPromptForOptionalFields,
  updateEnvContent,
};
