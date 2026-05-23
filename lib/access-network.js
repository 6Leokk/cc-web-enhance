const net = require('net');

function normalizePort(port) {
  const value = Number(port);
  if (!Number.isSafeInteger(value) || value < 1 || value > 65535) {
    throw new Error('port must be an integer from 1 to 65535');
  }
  return value;
}

function isPrivateIpv4(address) {
  if (net.isIP(address) !== 4) return false;
  const parts = address.split('.').map(Number);
  if (parts[0] === 10) return true;
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  if (parts[0] === 192 && parts[1] === 168) return true;
  return false;
}

function getPrivateIpv4Addresses(networkInterfaces = {}) {
  const addresses = [];
  const seen = new Set();
  for (const entries of Object.values(networkInterfaces || {})) {
    for (const info of entries || []) {
      if (!info || info.family !== 'IPv4' || info.internal || !info.address) continue;
      const address = String(info.address).trim();
      if (!isPrivateIpv4(address) || seen.has(address)) continue;
      seen.add(address);
      addresses.push(address);
    }
  }
  return addresses;
}

function formatHttpUrl(host, port) {
  const normalizedPort = normalizePort(port);
  const rawHost = String(host || '').trim();
  if (!rawHost) return '';
  const displayHost = rawHost.includes(':') && !rawHost.startsWith('[') ? `[${rawHost}]` : rawHost;
  return `http://${displayHost}:${normalizedPort}`;
}

function buildLocalUrls(host = '127.0.0.1', port = 8083) {
  const rawHost = String(host || '').trim();
  if (!rawHost || rawHost === '0.0.0.0' || rawHost === '::') {
    return [formatHttpUrl('127.0.0.1', port)];
  }
  if (rawHost === '::1') return [formatHttpUrl('::1', port)];
  return [formatHttpUrl(rawHost, port)];
}

function buildLanUrls(port = 8083, networkInterfaces = {}) {
  return getPrivateIpv4Addresses(networkInterfaces).map((address) => formatHttpUrl(address, port));
}

function recommendLanBindHost(networkInterfaces = {}) {
  return getPrivateIpv4Addresses(networkInterfaces)[0] || '';
}

module.exports = {
  buildLanUrls,
  buildLocalUrls,
  formatHttpUrl,
  getPrivateIpv4Addresses,
  isPrivateIpv4,
  recommendLanBindHost,
};
