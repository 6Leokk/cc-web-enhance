function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function sanitizeText(value, secrets) {
  let text = value instanceof Error ? value.message : String(value || '');
  for (const secret of secrets || []) {
    if (!secret) continue;
    text = text.replace(new RegExp(escapeRegExp(secret), 'g'), '<redacted>');
  }
  return text;
}

function logMessage(logger, message, secrets) {
  if (typeof logger !== 'function') return;
  try {
    logger(sanitizeText(message, secrets));
  } catch {}
}

function normalizePort(port) {
  const normalized = Number(port);
  if (!Number.isInteger(normalized) || normalized < 1 || normalized > 65535) return null;
  return normalized;
}

function extractListenerUrl(listener) {
  if (!listener) return '';
  try {
    if (typeof listener.url === 'function') return String(listener.url() || '');
    if (listener.url != null) return String(listener.url);
    if (listener.public_url != null) return String(listener.public_url);
  } catch {}
  return '';
}

function buildBaseHandle(overrides = {}) {
  return {
    provider: 'ngrok',
    actualState: 'stopped',
    running: false,
    url: '',
    forwardTo: '',
    reason: '',
    error: '',
    providerError: '',
    listener: null,
    authtoken: '',
    basicAuth: '',
    ...overrides,
  };
}

function getNgrokStatus(handle) {
  if (!handle) return buildBaseHandle({ reason: 'no handle' });
  const ownUrl = typeof handle.url === 'function' ? '' : handle.url;
  const url = ownUrl || extractListenerUrl(handle.listener) || extractListenerUrl(handle);
  const actualState = handle.actualState || (handle.listener ? 'running' : 'stopped');
  return {
    provider: handle.provider || 'ngrok',
    actualState,
    running: actualState === 'running',
    url: url || '',
    forwardTo: handle.forwardTo || '',
    reason: handle.reason || '',
    error: handle.error || '',
    providerError: handle.providerError || handle.error || '',
  };
}

async function loadNgrokSdk(ngrokSdk) {
  if (ngrokSdk) return ngrokSdk;
  return require('@ngrok/ngrok');
}

async function startNgrokTunnel(options = {}) {
  const port = normalizePort(options.port);
  const authtoken = String(options.authtoken || '').trim();
  const domain = String(options.domain || '').trim();
  const basicAuth = String(options.basicAuth || '').trim();
  const secrets = [authtoken, basicAuth].filter(Boolean);

  if (!authtoken) {
    return buildBaseHandle({
      actualState: 'skipped',
      reason: 'missing authtoken',
      authtoken,
      basicAuth,
    });
  }

  if (!port) {
    const error = 'invalid ngrok port';
    logMessage(options.logger, `ngrok start failed: ${error}`, secrets);
    return buildBaseHandle({
      actualState: 'error',
      reason: error,
      error,
      providerError: error,
      authtoken,
      basicAuth,
    });
  }

  const forwardTo = `http://127.0.0.1:${port}`;

  let ngrokSdk;
  try {
    ngrokSdk = await loadNgrokSdk(options.ngrokSdk);
  } catch (err) {
    const error = sanitizeText(`failed to load @ngrok/ngrok: ${err && err.message ? err.message : err}`, secrets);
    logMessage(options.logger, `ngrok start failed: ${error}`, secrets);
    return buildBaseHandle({
      actualState: 'error',
      forwardTo,
      reason: 'failed to load @ngrok/ngrok',
      error,
      providerError: error,
      authtoken,
      basicAuth,
    });
  }

  try {
    const forwardOptions = {
      addr: forwardTo,
      authtoken,
    };
    if (domain) forwardOptions.domain = domain;
    if (basicAuth) forwardOptions.basic_auth = [basicAuth];

    const listener = await ngrokSdk.forward(forwardOptions);
    const url = extractListenerUrl(listener);
    logMessage(options.logger, `ngrok tunnel started: ${url || forwardTo}`, secrets);
    return buildBaseHandle({
      actualState: 'running',
      running: true,
      url,
      forwardTo,
      listener,
      authtoken,
      basicAuth,
    });
  } catch (err) {
    const error = sanitizeText(err && err.message ? err.message : err, secrets);
    logMessage(options.logger, `ngrok start failed: ${error}`, secrets);
    return buildBaseHandle({
      actualState: 'error',
      forwardTo,
      reason: 'provider error',
      error,
      providerError: error,
      authtoken,
      basicAuth,
    });
  }
}

async function stopNgrokHandle(handle) {
  if (!handle) return { stopped: false, reason: 'no handle', provider: 'ngrok' };

  const currentUrl = (typeof handle.url === 'function' ? '' : handle.url)
    || extractListenerUrl(handle.listener)
    || extractListenerUrl(handle);
  const target = handle.listener && typeof handle.listener.close === 'function'
    ? handle.listener
    : (typeof handle.close === 'function' ? handle : null);

  if (!target) {
    const error = 'no close method';
    handle.actualState = 'error';
    handle.running = false;
    handle.url = currentUrl;
    handle.reason = error;
    handle.error = error;
    handle.providerError = error;
    return { stopped: false, reason: error, provider: handle.provider || 'ngrok', url: currentUrl || '', error };
  }

  try {
    await target.close();
    handle.actualState = 'stopped';
    handle.running = false;
    handle.url = currentUrl;
    handle.listener = null;
    handle.reason = '';
    handle.error = '';
    handle.providerError = '';
    return { stopped: true, provider: handle.provider || 'ngrok', url: currentUrl || '' };
  } catch (err) {
    const secrets = [handle.authtoken, handle.basicAuth].filter(Boolean);
    const error = sanitizeText(err && err.message ? err.message : err, secrets);
    handle.actualState = 'error';
    handle.running = false;
    handle.url = currentUrl;
    handle.error = error;
    handle.providerError = error;
    return { stopped: false, provider: handle.provider || 'ngrok', url: currentUrl || '', error };
  }
}

module.exports = {
  getNgrokStatus,
  startNgrokTunnel,
  stopNgrokHandle,
};
