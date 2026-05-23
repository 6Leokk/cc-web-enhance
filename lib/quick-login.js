'use strict';

const crypto = require('crypto');

const DEFAULT_TTL_MS = 10 * 60 * 1000;

function createRandomToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function invalidOrExpired() {
  return {
    ok: false,
    reason: 'invalid_or_expired',
    message: 'Quick login link is invalid or expired.',
  };
}

function normalizeBaseUrl(baseUrl) {
  let parsed;
  try {
    parsed = new URL(String(baseUrl || ''));
  } catch {
    throw new Error('baseUrl must be an absolute URL');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('baseUrl must use http or https');
  }
  return parsed.origin;
}

function createQuickLoginStore(options = {}) {
  const ttlMs = Number.isFinite(options.ttlMs) && options.ttlMs > 0 ? Math.floor(options.ttlMs) : DEFAULT_TTL_MS;
  const now = typeof options.now === 'function' ? options.now : Date.now;
  const createPairToken = typeof options.createPairToken === 'function' ? options.createPairToken : createRandomToken;
  const createSessionToken = typeof options.createSessionToken === 'function' ? options.createSessionToken : createRandomToken;
  const pairs = new Map();
  const initialPasswordChangeGrants = new Map();

  function currentTime() {
    return Number(now());
  }

  function pruneExpired(at = currentTime()) {
    for (const [key, record] of pairs.entries()) {
      if (!record || record.expiresAtMs <= at) pairs.delete(key);
    }
    for (const [sessionToken, grant] of initialPasswordChangeGrants.entries()) {
      if (!grant || grant.expiresAtMs <= at) initialPasswordChangeGrants.delete(sessionToken);
    }
  }

  function issueLink(issueOptions = {}) {
    const issuedAtMs = currentTime();
    pruneExpired(issuedAtMs);

    const baseUrl = normalizeBaseUrl(issueOptions.baseUrl);
    const token = String(createPairToken());
    if (!token) throw new Error('createPairToken must return a non-empty token');

    const expiresAtMs = issuedAtMs + ttlMs;
    pairs.set(hashToken(token), {
      expiresAtMs,
      mustChangePassword: !!issueOptions.mustChangePassword,
    });

    return {
      ok: true,
      baseUrlKind: issueOptions.baseUrlKind || '',
      baseUrl,
      url: `${baseUrl}/#pair=${encodeURIComponent(token)}`,
      ttlSeconds: Math.ceil(ttlMs / 1000),
      expiresAt: new Date(expiresAtMs).toISOString(),
      mustChangePassword: !!issueOptions.mustChangePassword,
    };
  }

  function exchange(pairToken) {
    const at = currentTime();
    pruneExpired(at);
    if (!pairToken || typeof pairToken !== 'string') return invalidOrExpired();

    const pairKey = hashToken(pairToken);
    const record = pairs.get(pairKey);
    if (!record || record.expiresAtMs <= at) {
      pairs.delete(pairKey);
      return invalidOrExpired();
    }

    pairs.delete(pairKey);
    const sessionToken = String(createSessionToken());
    if (!sessionToken) throw new Error('createSessionToken must return a non-empty token');

    if (record.mustChangePassword) {
      initialPasswordChangeGrants.set(sessionToken, {
        expiresAtMs: record.expiresAtMs,
      });
    }

    return {
      ok: true,
      token: sessionToken,
      mustChangePassword: !!record.mustChangePassword,
    };
  }

  function consumeInitialPasswordChangeGrant(sessionToken) {
    const at = currentTime();
    pruneExpired(at);
    if (!sessionToken || typeof sessionToken !== 'string') return false;
    const grant = initialPasswordChangeGrants.get(sessionToken);
    if (!grant || grant.expiresAtMs <= at) {
      initialPasswordChangeGrants.delete(sessionToken);
      return false;
    }
    initialPasswordChangeGrants.delete(sessionToken);
    return true;
  }

  function clear() {
    pairs.clear();
    initialPasswordChangeGrants.clear();
  }

  return {
    issueLink,
    exchange,
    consumeInitialPasswordChangeGrant,
    clear,
  };
}

module.exports = {
  createQuickLoginStore,
};
