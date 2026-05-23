const { buildLanUrls, buildLocalUrls } = require('./access-network');
const defaultFrpManager = require('./frp-manager');
const defaultNgrokManager = require('./ngrok-manager');

function cloneConfig(config = {}) {
  return {
    mode: config.mode || 'direct',
    directScope: config.directScope || 'local',
    publicUrl: config.publicUrl || '',
    trustProxy: !!config.trustProxy,
    ngrok: {
      authtoken: '',
      domain: '',
      basicAuth: '',
      autoStart: true,
      ...(config.ngrok || {}),
    },
    frp: {
      autoStart: true,
      ...(config.frp || {}),
    },
  };
}

function emptyUrls() {
  return {
    local: [],
    lan: [],
    public: [],
    remote: [],
  };
}

function normalizeMode(mode) {
  return ['direct', 'public', 'ngrok', 'frp'].includes(mode) ? mode : 'direct';
}

function isProviderMode(mode) {
  return mode === 'ngrok' || mode === 'frp';
}

function stableProviderConfig(config = {}) {
  const mode = normalizeMode(config.mode);
  if (mode === 'ngrok') {
    const ngrok = config.ngrok || {};
    return JSON.stringify({
      mode,
      authtoken: ngrok.authtoken || '',
      domain: ngrok.domain || '',
      basicAuth: ngrok.basicAuth || '',
      autoStart: ngrok.autoStart !== false,
    });
  }
  if (mode === 'frp') {
    return JSON.stringify({
      mode,
      autoStart: config.frp?.autoStart !== false,
    });
  }
  return JSON.stringify({ mode });
}

function requiresServerRestart(activeConfig = {}, desiredConfig = {}) {
  const activeMode = normalizeMode(activeConfig.mode);
  const desiredMode = normalizeMode(desiredConfig.mode);
  if (activeMode !== desiredMode && !isProviderMode(activeMode) && !isProviderMode(desiredMode)) return true;
  if (activeMode === 'direct' && desiredMode === 'direct') {
    return (activeConfig.directScope || 'local') !== (desiredConfig.directScope || 'local');
  }
  return false;
}

function requiresProviderRestart(state) {
  const desiredMode = normalizeMode(state.desiredConfig.mode);
  const activeMode = normalizeMode(state.activeConfig.mode);
  if (!isProviderMode(desiredMode)) return false;
  if (state.providerSuspended) return true;
  if (state.activeProvider !== desiredMode) return true;
  if (!state.providerHandle || state.providerState !== 'running') return true;
  if (activeMode !== desiredMode) return true;
  return stableProviderConfig(state.activeConfig) !== stableProviderConfig(state.desiredConfig);
}

function hasLoopbackHost(host) {
  return host === '127.0.0.1' || host === '::1' || host === 'localhost';
}

function normalizeMessage(value) {
  return String(value || '').trim();
}

function normalizeProviderActualState(value, running) {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'running' || raw === 'starting' || raw === 'stopping' || raw === 'error' || raw === 'stopped') {
    return raw;
  }
  if (raw === 'skipped' || raw === 'disabled') return 'stopped';
  return running ? 'running' : 'stopped';
}

function buildQuickLogin(status) {
  const ttlSeconds = 600;
  const hasLocal = Array.isArray(status.urls.local) && status.urls.local.length > 0;
  const hasLan = Array.isArray(status.urls.lan) && status.urls.lan.length > 0;
  const hasPublic = Array.isArray(status.urls.public) && status.urls.public.length > 0;
  const hasRemote = Array.isArray(status.urls.remote) && status.urls.remote.length > 0;

  if (status.mode === 'public' && hasPublic && /^http:\/\//i.test(status.urls.public[0])) {
    return { allowed: false, reason: 'public_http_disabled', ttlSeconds };
  }

  if (isProviderMode(status.mode) && status.actualState !== 'running') {
    return { allowed: false, reason: 'provider_not_running', ttlSeconds };
  }

  if (!hasLocal && !hasLan && !hasPublic && !hasRemote) {
    return { allowed: false, reason: 'no_reachable_url', ttlSeconds };
  }

  return { allowed: true, reason: 'ok', ttlSeconds };
}

function createBaseStatus(state) {
  const mode = normalizeMode(state.activeConfig.mode);
  const urls = emptyUrls();
  urls.local = buildLocalUrls(state.host, state.port);
  if ((mode === 'direct' && state.activeConfig.directScope === 'lan') || mode === 'public') {
    urls.lan = buildLanUrls(state.port, state.networkInterfaces);
  }
  if (mode === 'public' && state.activeConfig.publicUrl) {
    urls.public = [state.activeConfig.publicUrl];
  }

  const warnings = [];
  if (mode === 'public' && hasLoopbackHost(state.host)) {
    warnings.push('Public mode is configured while cc-web is still bound to a local-only host.');
  }
  if (mode === 'direct' && state.activeConfig.directScope === 'lan' && urls.lan.length === 0) {
    warnings.push('LAN mode is enabled but no private LAN IPv4 address was found.');
  }

  return {
    mode,
    desiredMode: normalizeMode(state.desiredConfig.mode),
    directScope: state.activeConfig.directScope || 'local',
    actualState: 'running',
    provider: 'none',
    restartRequired: requiresServerRestart(state.activeConfig, state.desiredConfig),
    providerRestartRequired: requiresProviderRestart(state),
    urls,
    warnings,
    errors: [],
    quickLogin: null,
  };
}

function mergeProviderStatus(status, providerStatus) {
  status.provider = providerStatus.provider || status.provider;
  status.actualState = normalizeProviderActualState(providerStatus.actualState, providerStatus.running);
  if (providerStatus.url) status.urls.remote = [providerStatus.url];
  if (providerStatus.reason && status.actualState !== 'running') status.warnings.push(providerStatus.reason);
  if (providerStatus.error || providerStatus.providerError) {
    status.errors.push(providerStatus.providerError || providerStatus.error);
  }
  return status;
}

function createAccessManager(options = {}) {
  const state = {
    env: options.env || process.env,
    host: options.host || '127.0.0.1',
    port: options.port || 8083,
    logger: typeof options.logger === 'function' ? options.logger : null,
    networkInterfaces: options.networkInterfaces || {},
    frpManager: options.frpManager || defaultFrpManager,
    ngrokManager: options.ngrokManager || defaultNgrokManager,
    desiredConfig: cloneConfig(options.accessConfig || {}),
    activeConfig: cloneConfig(options.accessConfig || {}),
    activeProvider: 'none',
    providerHandle: null,
    providerState: 'stopped',
    providerError: '',
    providerSuspended: false,
  };

  function log(message) {
    try { state.logger?.(message); } catch {}
  }

  function getProviderStatus() {
    if (state.activeProvider === 'ngrok') {
      return state.ngrokManager.getNgrokStatus(state.providerHandle);
    }
    if (state.activeProvider === 'frp') {
      const started = !!state.providerHandle?.started;
      return {
        provider: 'frp',
        actualState: state.providerState || (started ? 'running' : 'stopped'),
        running: started && state.providerState !== 'stopped',
        url: '',
        reason: state.providerHandle?.reason || '',
        error: state.providerError || '',
        providerError: state.providerError || '',
      };
    }
    return null;
  }

  function getStatus() {
    const status = createBaseStatus(state);
    const providerStatus = getProviderStatus();
    if (providerStatus) mergeProviderStatus(status, providerStatus);
    status.quickLogin = buildQuickLogin(status);
    return status;
  }

  function clearProviderIdentity() {
    state.activeProvider = 'none';
    state.providerHandle = null;
    state.providerState = 'stopped';
    state.providerError = '';
    state.providerSuspended = false;
  }

  function providerTransitionCleared() {
    return state.activeProvider === 'none' && !state.providerHandle && state.providerState !== 'error';
  }

  async function stopProviderForTransition() {
    await stop({ preserveProvider: false, preserveSuspended: false });
    return providerTransitionCleared();
  }

  async function stop(options = {}) {
    const preserveProvider = options.preserveProvider !== false;
    const preserveSuspended = options.preserveSuspended !== false;
    const previousProvider = state.activeProvider;
    let stopResult = null;
    if (state.activeProvider === 'ngrok') {
      if (!state.providerHandle) {
        if (!preserveProvider) clearProviderIdentity();
        return getStatus();
      }
      stopResult = state.providerHandle
        ? await state.ngrokManager.stopNgrokHandle(state.providerHandle)
        : { stopped: true };
      if (state.providerHandle) {
        state.providerHandle.actualState = 'stopped';
        state.providerHandle.running = false;
        if (stopResult?.url) state.providerHandle.url = stopResult.url;
        if (stopResult?.error) {
          state.providerHandle.error = stopResult.error;
          state.providerHandle.providerError = stopResult.error;
        }
      }
    } else if (state.activeProvider === 'frp') {
      if (!state.providerHandle?.started) {
        if (!preserveProvider) clearProviderIdentity();
        return getStatus();
      }
      stopResult = state.providerHandle?.started
        ? state.frpManager.stopFrpHandle(state.providerHandle)
        : { stopped: true };
    }
    const stopFailed = stopResult && stopResult.stopped === false;
    if (stopFailed) {
      state.providerState = 'error';
      state.providerError = stopResult.error || state.providerError || 'provider stop failed';
      if (state.providerHandle) {
        state.providerHandle.actualState = 'error';
        state.providerHandle.error = state.providerError;
        state.providerHandle.providerError = state.providerError;
      }
    } else {
      if (preserveProvider && isProviderMode(previousProvider)) {
        state.activeProvider = previousProvider;
        state.providerHandle = null;
        state.providerState = 'stopped';
        state.providerError = '';
      } else {
        clearProviderIdentity();
      }
      if (!preserveSuspended || !preserveProvider) {
        state.providerSuspended = false;
      } else if (isProviderMode(previousProvider)) {
        state.providerSuspended = true;
      }
    }
    return getStatus();
  }

  async function start(options = {}) {
    const fromReload = options.fromReload === true;
    const manual = options.manual === true;
    const mode = normalizeMode(state.desiredConfig.mode);
    if (!isProviderMode(mode)) {
      state.providerSuspended = false;
      if (state.activeProvider !== 'none') {
        const stopped = await stopProviderForTransition();
        if (!stopped) return getStatus();
      }
      if (!requiresServerRestart(state.activeConfig, state.desiredConfig)) {
        state.activeConfig = cloneConfig(state.desiredConfig);
      } else {
        state.activeConfig.publicUrl = state.desiredConfig.publicUrl || '';
      }
      state.activeProvider = 'none';
      state.providerState = 'running';
      state.providerError = '';
      return getStatus();
    }

    const providerChanged = stableProviderConfig(state.activeConfig) !== stableProviderConfig(state.desiredConfig);
    const activeProviderRunning = state.activeProvider === mode && state.providerHandle && state.providerState === 'running';
    if (state.providerSuspended && fromReload) {
      return getStatus();
    }
    if (state.activeProvider === mode && state.providerHandle && !providerChanged && activeProviderRunning) {
      return getStatus();
    }
    if (providerChanged && activeProviderRunning && fromReload) {
      return getStatus();
    }

    if (state.activeProvider && state.activeProvider !== 'none' && state.activeProvider !== mode) {
      const stopped = await stopProviderForTransition();
      if (!stopped) return getStatus();
    }

    if (state.activeProvider === mode && state.providerHandle && providerChanged) {
      const stopped = await stopProviderForTransition();
      if (!stopped) return getStatus();
    }

    state.activeConfig = cloneConfig(state.desiredConfig);
    if (state.activeProvider && state.activeProvider !== 'none' && state.activeProvider !== mode) {
      const stopped = await stopProviderForTransition();
      if (!stopped) return getStatus();
    }

    if (mode === 'ngrok') {
      const ngrok = state.activeConfig.ngrok || {};
      if (ngrok.autoStart === false && !manual) {
        state.activeProvider = 'ngrok';
        state.providerHandle = null;
        state.providerState = 'stopped';
        state.providerSuspended = false;
        return getStatus();
      }
      state.activeProvider = 'ngrok';
      state.providerSuspended = false;
      state.providerHandle = await state.ngrokManager.startNgrokTunnel({
        port: state.port,
        authtoken: ngrok.authtoken,
        domain: ngrok.domain,
        basicAuth: ngrok.basicAuth,
        logger: log,
      });
      state.providerState = state.providerHandle?.actualState || (state.providerHandle?.running ? 'running' : 'stopped');
      if (state.providerHandle?.providerError) state.providerError = state.providerHandle.providerError;
      return getStatus();
    }

    if (mode === 'frp') {
      if (state.activeConfig.frp?.autoStart === false && !manual) {
        state.activeProvider = 'frp';
        state.providerHandle = { started: false, reason: 'auto-start disabled' };
        state.providerState = 'stopped';
        state.providerSuspended = false;
        return getStatus();
      }
      state.activeProvider = 'frp';
      state.providerSuspended = false;
      try {
        state.providerHandle = state.frpManager.startFrpFromEnv(state.env, { logger: log });
        state.providerState = state.providerHandle?.started ? 'running' : 'skipped';
        state.providerError = '';
      } catch (err) {
        state.providerHandle = null;
        state.providerState = 'error';
        state.providerError = normalizeMessage(err.message || err);
      }
      return getStatus();
    }

    return getStatus();
  }

  async function reload(desiredConfig) {
    state.desiredConfig = cloneConfig(desiredConfig || {});
    return start({ fromReload: true });
  }

  return {
    getStatus,
    reload,
    start,
    stop,
  };
}

module.exports = {
  createAccessManager,
};
