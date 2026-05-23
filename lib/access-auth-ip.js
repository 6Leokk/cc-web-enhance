const net = require('net');

const TUNNEL_PROVIDERS = new Set(['ngrok', 'frp']);

function normalizeText(value) {
  if (value === undefined || value === null) return '';
  return String(value).trim();
}

function normalizeIp(value) {
  let ip = normalizeText(value);
  if (!ip) return null;
  if (ip.startsWith('"') && ip.endsWith('"')) ip = ip.slice(1, -1).trim();
  if (ip.startsWith('[') && ip.endsWith(']')) ip = ip.slice(1, -1).trim();
  if (ip.startsWith('::ffff:')) ip = ip.slice('::ffff:'.length);
  return ip || null;
}

function isIpAddress(value) {
  const ip = normalizeIp(value);
  return !!ip && net.isIP(ip) !== 0;
}

function normalizeMode(value) {
  return normalizeText(value).toLowerCase();
}

function normalizeProvider(value) {
  const provider = normalizeMode(value);
  if (TUNNEL_PROVIDERS.has(provider)) return provider;
  return '';
}

function getHeader(req, name) {
  const headers = req?.headers || {};
  const direct = headers[name];
  if (direct !== undefined) return direct;
  return headers[name.toLowerCase()];
}

function readForwardedFor(req, options = {}) {
  if (options.forwardedFor !== undefined && options.forwardedFor !== null) {
    return options.forwardedFor;
  }
  return getHeader(req, 'x-forwarded-for');
}

function firstForwardedIp(value) {
  const headerValue = Array.isArray(value) ? value[0] : value;
  const raw = normalizeText(headerValue);
  if (!raw) return null;
  const ip = normalizeIp(raw.split(',')[0]);
  return isIpAddress(ip) ? ip : null;
}

function readRemoteAddress(req, options = {}) {
  return normalizeIp(
    options.remoteAddress
      || req?.socket?.remoteAddress
      || req?.connection?.remoteAddress
      || null,
  );
}

function isLoopbackIp(value) {
  const ip = normalizeIp(value);
  if (!ip) return false;
  if (ip === '::1') return true;
  if (net.isIP(ip) === 4) return ip.split('.')[0] === '127';
  return false;
}

function ipIdentity(ip, source) {
  if (!ip) {
    return {
      identity: null,
      kind: 'unknown',
      source,
      whitelistEligible: false,
    };
  }
  return {
    identity: ip,
    kind: 'ip',
    source,
    whitelistEligible: true,
  };
}

function tunnelSharedIdentity(provider) {
  const safeProvider = TUNNEL_PROVIDERS.has(provider) ? provider : 'unknown';
  return {
    identity: `tunnel:${safeProvider}:unknown`,
    kind: 'tunnel-shared',
    source: 'tunnel-shared',
    whitelistEligible: false,
  };
}

function resolveAuthClientIdentity(req, options = {}) {
  const rawAccessMode = options.accessMode || options.mode;
  const accessMode = normalizeMode(rawAccessMode || 'direct');
  const hasExplicitAccessMode = normalizeText(rawAccessMode) !== '';
  const provider = TUNNEL_PROVIDERS.has(accessMode)
    ? accessMode
    : hasExplicitAccessMode
      ? ''
      : normalizeProvider(options.provider);
  const trustProxy = options.trustProxy === true;
  const remoteAddress = readRemoteAddress(req, options);
  const tunnelMode = TUNNEL_PROVIDERS.has(accessMode) || !!provider;

  if (trustProxy) {
    const forwardedIp = firstForwardedIp(readForwardedFor(req, options));
    if (forwardedIp) return ipIdentity(forwardedIp, 'forwarded');
    if (tunnelMode) return tunnelSharedIdentity(provider || accessMode);
  }

  if (tunnelMode) {
    if (!remoteAddress || isLoopbackIp(remoteAddress)) {
      return tunnelSharedIdentity(provider || accessMode);
    }
  }

  return ipIdentity(remoteAddress, 'socket');
}

function parseIpWhitelist(value) {
  const entries = value instanceof Set
    ? Array.from(value)
    : Array.isArray(value)
      ? value
      : normalizeText(value).split(/[\s,]+/);
  const whitelist = new Set();
  for (const entry of entries) {
    const ip = normalizeIp(entry);
    if (!ip || !isIpAddress(ip)) continue;
    whitelist.add(ip);
  }
  return whitelist;
}

function isAccessIdentityWhitelisted(identity, options = {}) {
  if (!identity || identity.whitelistEligible !== true) return false;
  const ip = normalizeIp(identity.identity);
  if (!ip || !isIpAddress(ip)) return false;
  if (identity.source === 'socket' && isLoopbackIp(ip)) return true;
  if (identity.source === 'socket' && net.isIP(ip) === 4 && ip.startsWith('100.')) return true;
  return parseIpWhitelist(options.ipWhitelist).has(ip);
}

module.exports = {
  isAccessIdentityWhitelisted,
  resolveAuthClientIdentity,
};
