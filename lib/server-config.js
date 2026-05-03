const DEFAULT_SERVER_HOST = '127.0.0.1';
const DEFAULT_SERVER_PORT = 8083;

function readEnvValue(env, primaryName, legacyName) {
  for (const name of [primaryName, legacyName]) {
    if (!name) continue;
    const raw = env[name];
    if (raw === undefined || raw === null) continue;
    const value = String(raw).trim();
    if (value !== '') return { name, value };
  }
  return null;
}

function parsePort(value, sourceName) {
  if (!/^\d+$/.test(value)) {
    throw new Error(`${sourceName} must be an integer port from 1 to 65535`);
  }
  const port = Number(value);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
    throw new Error(`${sourceName} must be an integer port from 1 to 65535`);
  }
  return port;
}

function resolveServerBindConfig(env = process.env) {
  const hostValue = readEnvValue(env, 'CC_WEB_HOST', 'HOST');
  const portValue = readEnvValue(env, 'CC_WEB_PORT', 'PORT');
  return {
    host: hostValue ? hostValue.value : DEFAULT_SERVER_HOST,
    port: portValue ? parsePort(portValue.value, portValue.name) : DEFAULT_SERVER_PORT,
  };
}

module.exports = {
  DEFAULT_SERVER_HOST,
  DEFAULT_SERVER_PORT,
  resolveServerBindConfig,
};
