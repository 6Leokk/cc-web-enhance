const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const DEFAULT_CONFIG_DIR = path.join(REPO_ROOT, 'config');
const ACCESS_CONFIG_FILENAME = 'access.json';

const DEFAULT_ACCESS_MODE = 'direct';
const DEFAULT_DIRECT_SCOPE = 'local';
const DEFAULT_PUBLIC_URL = '';
const DEFAULT_NGROK_AUTO_START = true;
const DEFAULT_FRP_AUTO_START = true;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function hasText(value) {
  return String(value ?? '').trim() !== '';
}

function readEnvValue(env, key) {
  if (!env || !Object.prototype.hasOwnProperty.call(env, key)) return null;
  const value = String(env[key] ?? '').trim();
  return value === '' ? null : value;
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    throw new Error(`Failed to parse ${filePath}: ${err.message}`);
  }
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function buildDefaultAccessConfig() {
  return {
    mode: DEFAULT_ACCESS_MODE,
    directScope: DEFAULT_DIRECT_SCOPE,
    publicUrl: DEFAULT_PUBLIC_URL,
    ngrok: {
      authtoken: '',
      domain: '',
      basicAuth: '',
      autoStart: DEFAULT_NGROK_AUTO_START,
    },
    frp: {
      autoStart: DEFAULT_FRP_AUTO_START,
    },
  };
}

function getAccessConfigPath(configDir = DEFAULT_CONFIG_DIR) {
  return path.join(configDir, ACCESS_CONFIG_FILENAME);
}

function normalizeAccessMode(value, fallback = DEFAULT_ACCESS_MODE) {
  const raw = String(value ?? '').trim().toLowerCase();
  if (!raw) {
    return normalizeAccessMode(fallback, DEFAULT_ACCESS_MODE);
  }
  if (!['direct', 'public', 'ngrok', 'frp'].includes(raw)) {
    throw new Error('CC_WEB_ACCESS_MODE must be direct, public, ngrok, or frp');
  }
  return raw;
}

function normalizeDirectScope(value, fallback = DEFAULT_DIRECT_SCOPE) {
  const raw = String(value ?? '').trim().toLowerCase();
  if (!raw) {
    return normalizeDirectScope(fallback, DEFAULT_DIRECT_SCOPE);
  }
  if (!['local', 'lan'].includes(raw)) {
    throw new Error('CC_WEB_DIRECT_SCOPE must be local or lan');
  }
  return raw;
}

function normalizeBoolean(value, fallback) {
  if (value === undefined || value === null || value === '') return !!fallback;
  if (typeof value === 'boolean') return value;
  const raw = String(value).trim().toLowerCase();
  if (!raw) return !!fallback;
  if (['1', 'true', 'yes', 'on'].includes(raw)) return true;
  if (['0', 'false', 'no', 'off'].includes(raw)) return false;
  throw new Error(`Invalid boolean value: ${value}`);
}

function normalizePublicUrl(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('CC_WEB_PUBLIC_URL must be an absolute http(s) origin');
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('CC_WEB_PUBLIC_URL must use http or https');
  }
  if (url.username || url.password) {
    throw new Error('CC_WEB_PUBLIC_URL must not include credentials');
  }
  if ((url.pathname || '/') !== '/' || url.search || url.hash) {
    throw new Error('CC_WEB_PUBLIC_URL must be an origin without path, query, or hash');
  }
  return url.origin.replace(/\/+$/, '');
}

function maskSecret(value) {
  const raw = String(value ?? '');
  if (!raw) return '';
  if (raw.length <= 8) return '****';
  return `${raw.slice(0, 4)}****${raw.slice(-4)}`;
}

function isMaskedValue(value) {
  return typeof value === 'string' && (/^.{0,4}\*{4}.{0,4}$/).test(value);
}

function normalizeSecretValue(value, fallback = '', options = {}) {
  const clearFields = new Set(options.clearFields || []);
  const fieldPath = options.fieldPath || '';
  const lockedFields = new Set(options.lockedFields || []);
  if (clearFields.has(fieldPath)) return '';
  if (lockedFields.has(fieldPath)) return String(fallback ?? '');
  if (value === undefined || value === null) return String(fallback ?? '');
  const raw = String(value).trim();
  if (!raw) return String(fallback ?? '');
  if (isMaskedValue(raw)) return String(fallback ?? '');
  return raw;
}

function rejectLockedClears(clearFields = [], lockedFields = []) {
  const locked = new Set(lockedFields);
  for (const field of clearFields || []) {
    if (locked.has(field)) {
      throw new Error(`Cannot clear ${field}; it is controlled by environment`);
    }
  }
}

function normalizeSavedAccessConfig(input = {}, previous = buildDefaultAccessConfig(), options = {}) {
  const current = {
    ...buildDefaultAccessConfig(),
    ...(previous || {}),
    ngrok: {
      ...buildDefaultAccessConfig().ngrok,
      ...(previous?.ngrok || {}),
    },
    frp: {
      ...buildDefaultAccessConfig().frp,
      ...(previous?.frp || {}),
    },
  };
  const lockedFields = new Set(options.lockedFields || []);
  const clearFields = new Set(options.clearFields || []);
  const source = input && typeof input === 'object' ? input : {};

  const next = clone(current);
  if (lockedFields.has('mode')) {
    next.mode = current.mode;
  } else if (clearFields.has('mode')) {
    next.mode = DEFAULT_ACCESS_MODE;
  } else if (Object.prototype.hasOwnProperty.call(source, 'mode') && !isMaskedValue(source.mode) && String(source.mode ?? '').trim() !== '') {
    next.mode = normalizeAccessMode(source.mode, current.mode);
  }

  if (lockedFields.has('directScope')) {
    next.directScope = current.directScope;
  } else if (clearFields.has('directScope')) {
    next.directScope = DEFAULT_DIRECT_SCOPE;
  } else if (Object.prototype.hasOwnProperty.call(source, 'directScope') && String(source.directScope ?? '').trim() !== '') {
    next.directScope = normalizeDirectScope(source.directScope, current.directScope);
  }

  if (lockedFields.has('publicUrl')) {
    next.publicUrl = current.publicUrl;
  } else if (clearFields.has('publicUrl')) {
    next.publicUrl = '';
  } else if (Object.prototype.hasOwnProperty.call(source, 'publicUrl')) {
    const raw = String(source.publicUrl ?? '').trim();
    if (raw && !isMaskedValue(raw)) {
      next.publicUrl = normalizePublicUrl(raw);
    }
  }

  const sourceNgrok = source.ngrok && typeof source.ngrok === 'object' ? source.ngrok : {};
  next.ngrok.authtoken = normalizeSecretValue(sourceNgrok.authtoken, current.ngrok.authtoken, {
    fieldPath: 'ngrok.authtoken',
    clearFields,
    lockedFields,
  });
  if (!lockedFields.has('ngrok.domain') && clearFields.has('ngrok.domain')) {
    next.ngrok.domain = '';
  } else if (!lockedFields.has('ngrok.domain') && Object.prototype.hasOwnProperty.call(sourceNgrok, 'domain')) {
    const raw = String(sourceNgrok.domain ?? '').trim();
    if (raw && !isMaskedValue(raw)) {
      next.ngrok.domain = raw;
    }
  }
  next.ngrok.basicAuth = normalizeSecretValue(sourceNgrok.basicAuth, current.ngrok.basicAuth, {
    fieldPath: 'ngrok.basicAuth',
    clearFields,
    lockedFields,
  });
  if (!lockedFields.has('ngrok.autoStart') && clearFields.has('ngrok.autoStart')) {
    next.ngrok.autoStart = DEFAULT_NGROK_AUTO_START;
  } else if (!lockedFields.has('ngrok.autoStart') && Object.prototype.hasOwnProperty.call(sourceNgrok, 'autoStart')) {
    next.ngrok.autoStart = normalizeBoolean(sourceNgrok.autoStart, current.ngrok.autoStart);
  }

  const sourceFrp = source.frp && typeof source.frp === 'object' ? source.frp : {};
  if (!lockedFields.has('frp.autoStart') && clearFields.has('frp.autoStart')) {
    next.frp.autoStart = DEFAULT_FRP_AUTO_START;
  } else if (!lockedFields.has('frp.autoStart') && Object.prototype.hasOwnProperty.call(sourceFrp, 'autoStart')) {
    next.frp.autoStart = normalizeBoolean(sourceFrp.autoStart, current.frp.autoStart);
  }

  return next;
}

function loadAccessConfig(configDir = DEFAULT_CONFIG_DIR) {
  const configPath = getAccessConfigPath(configDir);
  const raw = readJson(configPath);
  if (!raw) return buildDefaultAccessConfig();
  return normalizeSavedAccessConfig(raw, buildDefaultAccessConfig());
}

function saveAccessConfig(configDir = DEFAULT_CONFIG_DIR, config = {}, options = {}) {
  const env = options.env || process.env;
  const existing = loadAccessConfig(configDir);
  const lockedFields = getLockedAccessFields(env);
  rejectLockedClears(options.clearFields || [], lockedFields);
  const saved = normalizeSavedAccessConfig(config, existing, {
    clearFields: options.clearFields || [],
    lockedFields,
  });
  writeJson(getAccessConfigPath(configDir), saved);
  return saved;
}

function hasCompatibilityFrpMode(env) {
  const frpMode = readEnvValue(env, 'FRP_MODE');
  return frpMode === 'client' || frpMode === 'server';
}

function getLockedAccessFields(env = process.env) {
  const locked = new Set();
  if (hasText(env?.CC_WEB_ACCESS_MODE) || hasCompatibilityFrpMode(env)) locked.add('mode');
  if (hasText(env?.CC_WEB_DIRECT_SCOPE)) locked.add('directScope');
  if (hasText(env?.CC_WEB_PUBLIC_URL)) locked.add('publicUrl');
  if (hasText(env?.CC_WEB_TRUST_PROXY)) locked.add('trustProxy');
  if (hasText(env?.NGROK_AUTHTOKEN)) locked.add('ngrok.authtoken');
  if (hasText(env?.NGROK_DOMAIN)) locked.add('ngrok.domain');
  if (hasText(env?.NGROK_BASIC_AUTH)) locked.add('ngrok.basicAuth');
  if (hasText(env?.NGROK_AUTO_START)) locked.add('ngrok.autoStart');
  if (hasText(env?.FRP_AUTO_START)) locked.add('frp.autoStart');
  return Array.from(locked);
}

function resolveAccessConfig(env = process.env, options = {}) {
  const configDir = options.configDir || DEFAULT_CONFIG_DIR;
  const rawSaved = readJson(getAccessConfigPath(configDir));
  const saved = rawSaved
    ? normalizeSavedAccessConfig(rawSaved, buildDefaultAccessConfig())
    : buildDefaultAccessConfig();
  const rawNgrok = rawSaved?.ngrok && typeof rawSaved.ngrok === 'object' ? rawSaved.ngrok : {};
  const rawFrp = rawSaved?.frp && typeof rawSaved.frp === 'object' ? rawSaved.frp : {};
  const hasSavedField = (object, key) => !!object && Object.prototype.hasOwnProperty.call(object, key);
  const lockedFields = getLockedAccessFields(env);

  const modeEnv = readEnvValue(env, 'CC_WEB_ACCESS_MODE');
  let mode = saved.mode || DEFAULT_ACCESS_MODE;
  let modeSource = hasSavedField(rawSaved, 'mode') ? 'config' : 'default';
  if (modeEnv) {
    mode = normalizeAccessMode(modeEnv, saved.mode);
    modeSource = 'env';
  } else if (!hasSavedField(rawSaved, 'mode') && hasCompatibilityFrpMode(env)) {
    mode = 'frp';
    modeSource = 'compatibility';
  }

  const directScopeEnv = readEnvValue(env, 'CC_WEB_DIRECT_SCOPE');
  const directScope = directScopeEnv
    ? normalizeDirectScope(directScopeEnv, saved.directScope)
    : normalizeDirectScope(saved.directScope, DEFAULT_DIRECT_SCOPE);
  const directScopeSource = directScopeEnv ? 'env' : (hasSavedField(rawSaved, 'directScope') ? 'config' : 'default');

  const publicUrlEnv = readEnvValue(env, 'CC_WEB_PUBLIC_URL');
  const publicUrl = publicUrlEnv
    ? normalizePublicUrl(publicUrlEnv)
    : normalizePublicUrl(saved.publicUrl || '');
  const publicUrlSource = publicUrlEnv ? 'env' : (hasSavedField(rawSaved, 'publicUrl') ? 'config' : 'default');

  const ngrokAuthtokenEnv = readEnvValue(env, 'NGROK_AUTHTOKEN');
  const ngrokDomainEnv = readEnvValue(env, 'NGROK_DOMAIN');
  const ngrokBasicAuthEnv = readEnvValue(env, 'NGROK_BASIC_AUTH');
  const ngrokAutoStartEnv = readEnvValue(env, 'NGROK_AUTO_START');
  const frpAutoStartEnv = readEnvValue(env, 'FRP_AUTO_START');

  const ngrok = {
    authtoken: ngrokAuthtokenEnv !== null ? ngrokAuthtokenEnv : String(saved.ngrok?.authtoken || ''),
    domain: ngrokDomainEnv !== null ? ngrokDomainEnv : String(saved.ngrok?.domain || ''),
    basicAuth: ngrokBasicAuthEnv !== null ? ngrokBasicAuthEnv : String(saved.ngrok?.basicAuth || ''),
    autoStart: ngrokAutoStartEnv !== null
      ? normalizeBoolean(ngrokAutoStartEnv, saved.ngrok?.autoStart ?? DEFAULT_NGROK_AUTO_START)
      : normalizeBoolean(saved.ngrok?.autoStart, DEFAULT_NGROK_AUTO_START),
  };

  const frp = {
    autoStart: frpAutoStartEnv !== null
      ? normalizeBoolean(frpAutoStartEnv, saved.frp?.autoStart ?? DEFAULT_FRP_AUTO_START)
      : normalizeBoolean(saved.frp?.autoStart, DEFAULT_FRP_AUTO_START),
  };

  return {
    mode,
    directScope,
    publicUrl,
    trustProxy: normalizeBoolean(readEnvValue(env, 'CC_WEB_TRUST_PROXY'), false),
    ngrok,
    frp,
    source: {
      mode: modeSource,
      directScope: directScopeSource,
      publicUrl: publicUrlSource,
      ngrokAuthtoken: ngrokAuthtokenEnv !== null ? 'env' : (saved.ngrok?.authtoken ? 'config' : 'unset'),
      ngrokDomain: ngrokDomainEnv !== null ? 'env' : (saved.ngrok?.domain ? 'config' : 'unset'),
      ngrokBasicAuth: ngrokBasicAuthEnv !== null ? 'env' : (saved.ngrok?.basicAuth ? 'config' : 'unset'),
      ngrokAutoStart: ngrokAutoStartEnv !== null ? 'env' : (hasSavedField(rawNgrok, 'autoStart') ? 'config' : 'default'),
      frpAutoStart: frpAutoStartEnv !== null ? 'env' : (hasSavedField(rawFrp, 'autoStart') ? 'config' : 'default'),
      trustProxy: hasText(env?.CC_WEB_TRUST_PROXY) ? 'env' : 'default',
    },
    lockedFields,
  };
}

function maskAccessConfig(config = {}) {
  const masked = clone(config);
  masked.ngrok = {
    ...(masked.ngrok || {}),
    authtoken: maskSecret(masked.ngrok?.authtoken || ''),
    basicAuth: maskSecret(masked.ngrok?.basicAuth || ''),
  };
  return masked;
}

module.exports = {
  ACCESS_CONFIG_FILENAME,
  DEFAULT_ACCESS_MODE,
  DEFAULT_CONFIG_DIR,
  DEFAULT_DIRECT_SCOPE,
  DEFAULT_FRP_AUTO_START,
  DEFAULT_NGROK_AUTO_START,
  buildDefaultAccessConfig,
  getAccessConfigPath,
  getLockedAccessFields,
  loadAccessConfig,
  maskAccessConfig,
  maskSecret,
  normalizeAccessMode,
  normalizeBoolean,
  normalizeDirectScope,
  normalizePublicUrl,
  resolveAccessConfig,
  saveAccessConfig,
};
