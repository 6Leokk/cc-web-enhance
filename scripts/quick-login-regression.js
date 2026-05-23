#!/usr/bin/env node

const assert = require('assert');

const { createQuickLoginStore } = require('../lib/quick-login');

function assertIncludes(haystack, needle, message) {
  assert(String(haystack).includes(needle), `${message}: missing ${needle}`);
}

function assertNotIncludes(haystack, needle, message) {
  assert(!String(haystack).includes(needle), `${message}: found ${needle}`);
}

function extractPairToken(link) {
  const parsed = new URL(link);
  assert.strictEqual(parsed.pathname, '/', 'quick-login link must use the app root path');
  assert.strictEqual(parsed.search, '', 'quick-login link must not put the pair token in the query string');
  assertIncludes(parsed.hash, '#pair=', 'quick-login link must carry the pair token in the fragment');
  const token = new URLSearchParams(parsed.hash.slice(1)).get('pair');
  assert(token, 'quick-login fragment should include a non-empty pair token');
  return token;
}

function createDeterministicStore(options = {}) {
  let now = options.now || Date.parse('2026-05-23T12:00:00.000Z');
  let nextPair = 0;
  let nextSession = 0;
  const store = createQuickLoginStore({
    ttlMs: options.ttlMs || 60_000,
    now: () => now,
    createPairToken: () => `pair-token-${++nextPair}`,
    createSessionToken: () => `session-token-${++nextSession}`,
  });
  return {
    store,
    advance(ms) {
      now += ms;
    },
  };
}

function testIssueLinkUsesRootFragment() {
  const { store } = createDeterministicStore();
  const issued = store.issueLink({
    baseUrl: 'https://demo.ngrok-free.app/',
    baseUrlKind: 'remote',
    mustChangePassword: false,
  });

  assert.strictEqual(issued.ok, true, 'issueLink should succeed');
  assert.strictEqual(issued.baseUrl, 'https://demo.ngrok-free.app', 'baseUrl should be normalized without a trailing slash');
  assert.strictEqual(issued.baseUrlKind, 'remote', 'issueLink should echo the selected URL kind');
  assert.strictEqual(issued.ttlSeconds, 60, 'issueLink should report ttlSeconds');
  assert.strictEqual(issued.expiresAt, '2026-05-23T12:01:00.000Z', 'issueLink should report the expiration timestamp');
  assert.strictEqual(issued.mustChangePassword, false, 'issueLink should report mustChangePassword');
  assert.strictEqual(issued.url, 'https://demo.ngrok-free.app/#pair=pair-token-1', 'quick-login URL must be `${baseUrl}/#pair=<token>`');
  assertNotIncludes(issued.url, '?pair=', 'quick-login URL must never use query-string pair tokens');
  assertNotIncludes(issued.url, '/login#pair=', 'quick-login URL must not use a /login path');
  assert.strictEqual(Object.prototype.hasOwnProperty.call(issued, 'pairToken'), false, 'issueLink should not return the raw pair token separately');
}

function testExchangeIsOneTimeAndReturnsNormalSessionToken() {
  const { store } = createDeterministicStore();
  const issued = store.issueLink({
    baseUrl: 'https://demo.ngrok-free.app',
    mustChangePassword: false,
  });
  const pairToken = extractPairToken(issued.url);

  const exchanged = store.exchange(pairToken);
  assert.deepStrictEqual(exchanged, {
    ok: true,
    token: 'session-token-1',
    mustChangePassword: false,
  }, 'exchange should return a normal session token');

  const replay = store.exchange(pairToken);
  assert.strictEqual(replay.ok, false, 'pair tokens should be one-time');
  assert.strictEqual(replay.reason, 'invalid_or_expired', 'replayed pair token should have a stable failure reason');
}

function testPairTokensExpireAndDoNotSurviveRestart() {
  const harness = createDeterministicStore({ ttlMs: 10_000 });
  const issued = harness.store.issueLink({
    baseUrl: 'https://demo.ngrok-free.app',
    mustChangePassword: false,
  });
  const pairToken = extractPairToken(issued.url);

  harness.advance(10_001);
  const expired = harness.store.exchange(pairToken);
  assert.strictEqual(expired.ok, false, 'expired pair token should be rejected');
  assert.strictEqual(expired.reason, 'invalid_or_expired', 'expired pair token should have a stable failure reason');

  const freshProcessStore = createQuickLoginStore({
    createSessionToken: () => 'session-after-restart',
  });
  const afterRestart = freshProcessStore.exchange(pairToken);
  assert.strictEqual(afterRestart.ok, false, 'memory-only pair tokens should not survive process restart');
  assert.strictEqual(afterRestart.reason, 'invalid_or_expired', 'unknown pair token should have a stable failure reason');
}

function testMustChangeGrantIsBoundToSessionAndConsumedOnce() {
  const { store } = createDeterministicStore();
  const issued = store.issueLink({
    baseUrl: 'https://demo.ngrok-free.app',
    mustChangePassword: true,
  });
  const exchanged = store.exchange(extractPairToken(issued.url));

  assert.strictEqual(exchanged.ok, true, 'mustChange pair exchange should succeed');
  assert.strictEqual(exchanged.mustChangePassword, true, 'exchange should preserve mustChangePassword');
  assert.strictEqual(store.consumeInitialPasswordChangeGrant(exchanged.token), true, 'first password-change grant consumption should succeed');
  assert.strictEqual(store.consumeInitialPasswordChangeGrant(exchanged.token), false, 'password-change grant should be one-time');
  assert.strictEqual(store.consumeInitialPasswordChangeGrant('session-token-2'), false, 'grant should be bound to the exchanged session token');
}

function testClearInvalidatesPendingPairsAndGrants() {
  const { store } = createDeterministicStore();
  const pending = store.issueLink({
    baseUrl: 'https://demo.ngrok-free.app',
    mustChangePassword: false,
  });
  const mustChange = store.issueLink({
    baseUrl: 'https://demo.ngrok-free.app',
    mustChangePassword: true,
  });
  const exchanged = store.exchange(extractPairToken(mustChange.url));

  store.clear();

  assert.strictEqual(store.exchange(extractPairToken(pending.url)).ok, false, 'clear should invalidate pending pair tokens');
  assert.strictEqual(store.consumeInitialPasswordChangeGrant(exchanged.token), false, 'clear should invalidate outstanding password-change grants');
}

function testInvalidIssueInputsFailClosed() {
  const { store } = createDeterministicStore();
  assert.throws(
    () => store.issueLink({ baseUrl: 'http://', mustChangePassword: false }),
    /baseUrl/i,
    'issueLink should reject invalid base URLs',
  );
}

function run() {
  testIssueLinkUsesRootFragment();
  testExchangeIsOneTimeAndReturnsNormalSessionToken();
  testPairTokensExpireAndDoNotSurviveRestart();
  testMustChangeGrantIsBoundToSessionAndConsumedOnce();
  testClearInvalidatesPendingPairsAndGrants();
  testInvalidIssueInputsFailClosed();
  console.log('quick-login regression passed');
}

run();
