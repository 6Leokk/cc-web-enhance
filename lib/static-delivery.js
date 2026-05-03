const path = require('path');
const zlib = require('zlib');

function staticCacheControl(filePath) {
  const base = path.basename(filePath);
  if (base === 'index.html' || base === 'sw.js') return 'no-cache';
  return 'public, max-age=0, must-revalidate';
}

function isCompressibleStaticAsset(filePath) {
  return /\.(?:html|js|mjs|css|json|svg|txt|md|map)$/i.test(filePath);
}

function parseStaticEncodingPreferences(acceptEncoding) {
  const preferences = new Map();
  String(acceptEncoding || '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .forEach((part) => {
      const [namePart, ...params] = part.split(';');
      const name = String(namePart || '').trim().toLowerCase();
      if (!name) return;
      let q = 1;
      for (const param of params) {
        const match = String(param || '').trim().match(/^q=([0-9.]+)$/i);
        if (!match) continue;
        const parsed = Number(match[1]);
        q = Number.isFinite(parsed) ? parsed : 0;
        break;
      }
      preferences.set(name, q);
    });
  return preferences;
}

function selectStaticContentEncoding(acceptEncoding, filePath) {
  if (!isCompressibleStaticAsset(filePath)) return '';
  const preferences = parseStaticEncodingPreferences(acceptEncoding);
  const supported = ['br', 'gzip'];
  let bestName = '';
  let bestQ = 0;
  for (const name of supported) {
    const explicit = preferences.has(name);
    const q = Number(explicit ? preferences.get(name) : NaN);
    if (Number.isFinite(q) && q > bestQ) {
      bestName = name;
      bestQ = q;
    }
  }
  if (bestName) return bestName;
  const wildcardQ = Number(preferences.get('*'));
  if (Number.isFinite(wildcardQ) && wildcardQ > 0) {
    for (const name of supported) {
      if (!preferences.has(name)) return name;
    }
  }
  return '';
}

function buildStaticEtag(stat, contentEncoding = '') {
  const encodingTag = contentEncoding || 'identity';
  return `W/"${Number(stat.size || 0).toString(16)}-${Math.floor(Number(stat.mtimeMs || 0)).toString(16)}-${encodingTag}"`;
}

function createStaticAssetCompressionCache(options = {}) {
  const zlibImpl = options.zlibImpl || zlib;
  const maxEntries = Math.max(1, Number(options.maxEntries || 128));
  const cache = new Map();

  function cacheKey(filePath, stat, contentEncoding) {
    return [
      String(filePath || ''),
      Number(stat?.size || 0),
      Math.floor(Number(stat?.mtimeMs || 0)),
      String(contentEncoding || ''),
    ].join(':');
  }

  function getCompressedAsset(filePath, stat, data, contentEncoding) {
    if (!contentEncoding) return data;
    const key = cacheKey(filePath, stat, contentEncoding);
    if (cache.has(key)) return cache.get(key);

    let body = data;
    if (contentEncoding === 'br') body = zlibImpl.brotliCompressSync(data);
    else if (contentEncoding === 'gzip') body = zlibImpl.gzipSync(data);

    cache.set(key, body);
    if (cache.size > maxEntries) {
      const oldestKey = cache.keys().next().value;
      if (oldestKey) cache.delete(oldestKey);
    }
    return body;
  }

  return {
    getCompressedAsset,
  };
}

module.exports = {
  staticCacheControl,
  parseStaticEncodingPreferences,
  selectStaticContentEncoding,
  buildStaticEtag,
  createStaticAssetCompressionCache,
};
