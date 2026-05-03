const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const {
  readEnvFile,
  resolveFrpConfig,
} = require('./frp-config');

const REPO_ROOT = path.resolve(__dirname, '..');
const FRP_ROOT = path.join(REPO_ROOT, 'frp');
const BIN_DIR = path.join(FRP_ROOT, 'bin');
const LOG_DIR = path.join(FRP_ROOT, 'logs');
const RUN_DIR = path.join(FRP_ROOT, 'run');

function executableName(name) {
  return process.platform === 'win32' ? `${name}.exe` : name;
}

function hasUnsafePlaceholders(content) {
  return /\bYOUR_[A-Z0-9_]+\b/.test(String(content || ''));
}

function resolveFrpRuntime(config) {
  const binaryName = config.binaryName || (config.mode === 'server' ? 'frps' : 'frpc');
  return {
    mode: config.mode,
    binaryName,
    binaryPath: path.join(BIN_DIR, executableName(binaryName)),
    configPath: config.configPath,
    logPath: path.join(LOG_DIR, `${binaryName}.log`),
    pidPath: path.join(RUN_DIR, `${binaryName}.pid`),
  };
}

function isProcessRunning(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readProcessCommandLine(pid) {
  try {
    if (process.platform === 'linux') {
      return fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').replace(/\0/g, ' ').trim();
    }
  } catch {}
  try {
    return spawnSync('ps', ['-o', 'command=', '-p', String(pid)], { encoding: 'utf8' }).stdout.trim();
  } catch {
    return '';
  }
}

function isManagedFrpProcess(pid, runtime) {
  const cmdline = readProcessCommandLine(pid);
  if (!cmdline) return false;
  return cmdline.includes(path.basename(runtime.binaryPath)) && cmdline.includes(runtime.configPath);
}

function sleepBriefly() {
  if (process.platform === 'win32') {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
    return;
  }
  spawnSync('sleep', ['0.1'], { stdio: 'ignore' });
}

function waitForExit(pid, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isProcessRunning(pid)) return true;
    sleepBriefly();
  }
  return !isProcessRunning(pid);
}

function removePidFile(pidPath) {
  try { fs.unlinkSync(pidPath); } catch {}
}

function validateRuntime(runtime, options = {}) {
  if (runtime.mode === 'disabled') return { ok: false, reason: 'disabled' };
  if (!fs.existsSync(runtime.binaryPath)) return { ok: false, reason: `missing binary ${runtime.binaryPath}` };
  if (!fs.existsSync(runtime.configPath)) return { ok: false, reason: `missing config ${runtime.configPath}` };
  const content = fs.readFileSync(runtime.configPath, 'utf8');
  if (hasUnsafePlaceholders(content)) return { ok: false, reason: 'config contains YOUR_* placeholders' };
  if (options.requireManagedFree && fs.existsSync(runtime.pidPath)) {
    const pid = Number(fs.readFileSync(runtime.pidPath, 'utf8').trim());
    if (isProcessRunning(pid)) return { ok: false, reason: `already running as pid ${pid}` };
  }
  return { ok: true, reason: 'ok' };
}

function startFrp(config, options = {}) {
  const runtime = resolveFrpRuntime(config);
  const validation = validateRuntime(runtime, { requireManagedFree: true });
  if (!validation.ok) {
    if (options.strict) throw new Error(`frp start refused: ${validation.reason}`);
    options.logger?.(`frp start skipped: ${validation.reason}`);
    return { started: false, reason: validation.reason, runtime };
  }

  fs.mkdirSync(LOG_DIR, { recursive: true });
  fs.mkdirSync(RUN_DIR, { recursive: true });
  const outFd = fs.openSync(runtime.logPath, 'a');
  const child = spawn(runtime.binaryPath, ['-c', runtime.configPath], {
    cwd: REPO_ROOT,
    detached: !!options.detached,
    stdio: ['ignore', outFd, outFd],
  });
  fs.closeSync(outFd);
  fs.writeFileSync(runtime.pidPath, `${child.pid}\n`);

  child.on('exit', () => {
    removePidFile(runtime.pidPath);
  });
  child.on('error', (err) => {
    options.logger?.(`frp process error: ${err.message}`);
  });
  if (options.detached) child.unref();
  options.logger?.(`frp ${runtime.binaryName} started pid=${child.pid}`);
  return { started: true, child, runtime };
}

function startFrpFromEnv(env = process.env, options = {}) {
  if (env.FRP_AUTO_START === '0') {
    options.logger?.('frp auto-start disabled by FRP_AUTO_START=0');
    return { started: false, reason: 'auto-start disabled' };
  }
  const config = resolveFrpConfig(env, { defaultMode: 'disabled' });
  if (config.mode === 'disabled') return { started: false, reason: 'disabled' };
  return startFrp(config, { ...options, strict: false, detached: false });
}

function stopFrpHandle(handle, options = {}) {
  if (!handle?.child?.pid) return { stopped: false, reason: 'no child process' };
  const pid = handle.child.pid;
  try { handle.child.kill('SIGTERM'); } catch {}
  const exited = waitForExit(pid, options.timeoutMs || 3000);
  if (!exited && isManagedFrpProcess(pid, handle.runtime)) {
    try { process.kill(pid, 'SIGKILL'); } catch {}
  }
  removePidFile(handle.runtime.pidPath);
  return { stopped: true, pid };
}

function stopFrpPid(config, options = {}) {
  const runtime = resolveFrpRuntime(config);
  if (!fs.existsSync(runtime.pidPath)) return { stopped: false, reason: 'pid file missing', runtime };
  const pid = Number(fs.readFileSync(runtime.pidPath, 'utf8').trim());
  if (!isProcessRunning(pid)) {
    removePidFile(runtime.pidPath);
    return { stopped: false, reason: 'process not running', runtime };
  }
  if (!isManagedFrpProcess(pid, runtime)) {
    throw new Error(`Refusing to stop pid ${pid}; command line does not match ${runtime.binaryName} and config path`);
  }
  process.kill(pid, 'SIGTERM');
  const exited = waitForExit(pid, options.timeoutMs || 3000);
  if (!exited && isManagedFrpProcess(pid, runtime)) {
    process.kill(pid, 'SIGKILL');
  }
  removePidFile(runtime.pidPath);
  return { stopped: true, pid, runtime };
}

function getFrpStatus(config) {
  const runtime = resolveFrpRuntime(config);
  if (!fs.existsSync(runtime.pidPath)) return { running: false, reason: 'pid file missing', runtime };
  const pid = Number(fs.readFileSync(runtime.pidPath, 'utf8').trim());
  const running = isProcessRunning(pid) && isManagedFrpProcess(pid, runtime);
  return { running, pid, runtime, reason: running ? 'running' : 'pid not running or not managed frp' };
}

function loadConfigForCli(defaultMode = 'client') {
  const env = readEnvFile(path.join(REPO_ROOT, '.env'), process.env);
  return resolveFrpConfig(env, { defaultMode });
}

module.exports = {
  getFrpStatus,
  hasUnsafePlaceholders,
  loadConfigForCli,
  resolveFrpRuntime,
  startFrp,
  startFrpFromEnv,
  stopFrpHandle,
  stopFrpPid,
};
