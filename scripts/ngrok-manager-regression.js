#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const Module = require('module');

const root = path.resolve(__dirname, '..');
const serverJs = fs.readFileSync(path.join(root, 'server.js'), 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertIncludes(haystack, needle, message) {
  assert(String(haystack).includes(needle), `${message}: missing ${needle}`);
}

function assertNotIncludes(haystack, needle, message) {
  assert(!String(haystack).includes(needle), `${message}: found forbidden value ${needle}`);
}

function loadNgrokManagerFresh() {
  const modulePath = path.join(root, 'lib', 'ngrok-manager.js');
  delete require.cache[modulePath];
  return require(modulePath);
}

async function withPatchedNgrokLoad(hook, fn) {
  const originalLoad = Module._load;
  let ngrokLoadCount = 0;
  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === '@ngrok/ngrok') {
      ngrokLoadCount += 1;
      return hook(request, parent, isMain, ngrokLoadCount);
    }
    return originalLoad.apply(this, arguments);
  };
  try {
    return await fn(() => ngrokLoadCount);
  } finally {
    Module._load = originalLoad;
  }
}

function makeLogger() {
  const lines = [];
  return {
    lines,
    logger(message) {
      lines.push(String(message));
    },
  };
}

async function testMissingAuthtokenSkipsWithoutLoadingSdk() {
  await withPatchedNgrokLoad(() => {
    throw new Error('SDK should not be loaded when authtoken is missing');
  }, async (getLoadCount) => {
    const { startNgrokTunnel, getNgrokStatus } = loadNgrokManagerFresh();
    const { logger } = makeLogger();
    const handle = await startNgrokTunnel({ port: 8083, authtoken: '', logger });
    const status = getNgrokStatus(handle);

    assertEqual(getLoadCount(), 0, 'missing authtoken should skip SDK loading');
    assertEqual(status.provider, 'ngrok', 'missing authtoken should keep provider');
    assert(status.actualState === 'skipped' || status.actualState === 'disabled', 'missing authtoken should return skipped/disabled state');
    assertEqual(status.running, false, 'missing authtoken should not be running');
    assertIncludes(status.reason || '', 'authtoken', 'missing authtoken should explain why it skipped');
  });
}

async function testForwardOptionsAndLifecycle() {
  const calls = {
    close: 0,
    forwardOptions: null,
  };
  const listener = {
    url() {
      return 'https://demo.ngrok-free.app';
    },
    async close() {
      calls.close += 1;
    },
  };
  const ngrokSdk = {
    async forward(options) {
      calls.forwardOptions = options;
      return listener;
    },
  };

  const { startNgrokTunnel, stopNgrokHandle, getNgrokStatus } = loadNgrokManagerFresh();
  const handle = await startNgrokTunnel({
    port: 18083,
    authtoken: 'ngrok-token-123456',
    domain: 'demo.example.com',
    basicAuth: 'demo-user:demo-pass',
    ngrokSdk,
  });
  const runningStatus = getNgrokStatus(handle);

  assertEqual(calls.forwardOptions.addr, 'http://127.0.0.1:18083', 'ngrok forward should target loopback upstream');
  assertNotIncludes(calls.forwardOptions.addr, '0.0.0.0', 'ngrok forward should never target 0.0.0.0');
  assertEqual(calls.forwardOptions.authtoken, 'ngrok-token-123456', 'ngrok forward should receive authtoken');
  assertEqual(calls.forwardOptions.domain, 'demo.example.com', 'ngrok forward should receive custom domain');
  assertEqual(JSON.stringify(calls.forwardOptions.basic_auth), JSON.stringify(['demo-user:demo-pass']), 'ngrok forward should receive basic_auth');

  assertEqual(runningStatus.provider, 'ngrok', 'running tunnel should report ngrok provider');
  assertEqual(runningStatus.actualState, 'running', 'running tunnel should report running state');
  assertEqual(runningStatus.running, true, 'running tunnel should report running=true');
  assertEqual(runningStatus.url, 'https://demo.ngrok-free.app', 'running tunnel should expose listener URL');
  assertEqual(runningStatus.forwardTo, 'http://127.0.0.1:18083', 'running tunnel should report loopback upstream');

  await stopNgrokHandle(handle);
  const stoppedStatus = getNgrokStatus(handle);

  assertEqual(calls.close, 1, 'stopNgrokHandle should close the listener exactly once');
  assertEqual(stoppedStatus.provider, 'ngrok', 'stopped tunnel should preserve provider');
  assertEqual(stoppedStatus.actualState, 'stopped', 'stopped tunnel should report stopped state');
  assertEqual(stoppedStatus.running, false, 'stopped tunnel should report running=false');
  assertEqual(stoppedStatus.url, 'https://demo.ngrok-free.app', 'stopped tunnel should retain last URL for status');
}

async function testStopFallsBackToHandleClose() {
  let closeCalls = 0;
  const { stopNgrokHandle, getNgrokStatus } = loadNgrokManagerFresh();
  const handle = {
    provider: 'ngrok',
    actualState: 'running',
    url: 'https://fallback.ngrok-free.app',
    async close() {
      closeCalls += 1;
    },
  };

  await stopNgrokHandle(handle);

  assertEqual(closeCalls, 1, 'stopNgrokHandle should fall back to handle.close()');
  assertEqual(getNgrokStatus(handle).actualState, 'stopped', 'fallback close should move handle to stopped state');
}

async function testStopAcceptsRawListenerWithUrlFunction() {
  let closeCalls = 0;
  const { stopNgrokHandle, getNgrokStatus } = loadNgrokManagerFresh();
  const listener = {
    provider: 'ngrok',
    actualState: 'running',
    forwardTo: 'http://127.0.0.1:48083',
    url() {
      return 'https://raw-listener.ngrok-free.app';
    },
    async close() {
      closeCalls += 1;
    },
  };

  const result = await stopNgrokHandle(listener);
  const status = getNgrokStatus(listener);

  assertEqual(closeCalls, 1, 'stopNgrokHandle should close raw listener handles');
  assertEqual(result.stopped, true, 'raw listener close should report stopped=true');
  assertEqual(result.url, 'https://raw-listener.ngrok-free.app', 'raw listener stop result should expose URL string');
  assertEqual(status.url, 'https://raw-listener.ngrok-free.app', 'raw listener status should expose URL string after stop');
  assertEqual(typeof status.url, 'string', 'raw listener status URL must not be a function');
  assertEqual(status.actualState, 'stopped', 'raw listener close should move status to stopped');
}

async function testStopWithoutCloseDoesNotClaimStopped() {
  const { stopNgrokHandle, getNgrokStatus } = loadNgrokManagerFresh();
  const handle = {
    provider: 'ngrok',
    actualState: 'running',
    running: true,
    url: 'https://no-close.ngrok-free.app',
  };

  const result = await stopNgrokHandle(handle);
  const status = getNgrokStatus(handle);

  assertEqual(result.stopped, false, 'missing close method should report stopped=false');
  assertEqual(status.actualState, 'error', 'missing close method should keep status from pretending to be stopped');
  assertEqual(status.running, false, 'missing close method should no longer report running');
  assertIncludes(status.error || status.reason || '', 'close', 'missing close method should expose close-method error context');
}

async function testSuccessfulStopRetryClearsPreviousError() {
  let closeCalls = 0;
  const { stopNgrokHandle, getNgrokStatus } = loadNgrokManagerFresh();
  const handle = {
    provider: 'ngrok',
    actualState: 'running',
    url: 'https://retry-stop.ngrok-free.app',
    async close() {
      closeCalls += 1;
      if (closeCalls === 1) throw new Error('transient close failure');
    },
  };

  const firstResult = await stopNgrokHandle(handle);
  assertEqual(firstResult.stopped, false, 'first failed close should report stopped=false');
  assertIncludes(getNgrokStatus(handle).error, 'transient close failure', 'failed close should record error context');

  const secondResult = await stopNgrokHandle(handle);
  const status = getNgrokStatus(handle);

  assertEqual(secondResult.stopped, true, 'successful retry should report stopped=true');
  assertEqual(status.actualState, 'stopped', 'successful retry should set stopped state');
  assertEqual(status.error, '', 'successful retry should clear previous error');
  assertEqual(status.providerError, '', 'successful retry should clear previous provider error');
}

async function testSdkErrorsAreMasked() {
  const secretToken = 'secret-token-abcdef123456';
  const secretBasicAuth = 'alice:super-secret';
  const { lines, logger } = makeLogger();
  const { startNgrokTunnel, getNgrokStatus } = loadNgrokManagerFresh();
  const handle = await startNgrokTunnel({
    port: 28083,
    authtoken: secretToken,
    domain: 'masked.example.com',
    basicAuth: secretBasicAuth,
    logger,
    ngrokSdk: {
      async forward() {
        throw new Error(`ngrok rejected ${secretToken} and ${secretBasicAuth}`);
      },
    },
  });
  const status = getNgrokStatus(handle);
  const combinedLogs = lines.join('\n');

  assertEqual(status.provider, 'ngrok', 'SDK error should still report ngrok provider');
  assertEqual(status.actualState, 'error', 'SDK error should produce provider error state');
  assertEqual(status.running, false, 'SDK error should not report running');
  assertIncludes(status.error || '', 'ngrok rejected', 'SDK error should preserve non-secret context');
  assertNotIncludes(status.error || '', secretToken, 'SDK error status should mask authtoken');
  assertNotIncludes(status.error || '', secretBasicAuth, 'SDK error status should mask basic auth');
  assertNotIncludes(combinedLogs, secretToken, 'logger output should mask authtoken');
  assertNotIncludes(combinedLogs, secretBasicAuth, 'logger output should mask basic auth');
}

async function testMissingSdkReturnsProviderErrorWithoutImportCrash() {
  const secretToken = 'missing-sdk-token-abcdef';
  const secretBasicAuth = 'bob:hidden';
  await withPatchedNgrokLoad(() => {
    const err = new Error(`native load failed for ${secretToken} ${secretBasicAuth}`);
    err.code = 'MODULE_NOT_FOUND';
    throw err;
  }, async (getLoadCount) => {
    const { lines, logger } = makeLogger();
    const { startNgrokTunnel, getNgrokStatus } = loadNgrokManagerFresh();
    const handle = await startNgrokTunnel({
      port: 38083,
      authtoken: secretToken,
      basicAuth: secretBasicAuth,
      logger,
    });
    const status = getNgrokStatus(handle);
    const combinedLogs = lines.join('\n');

    assertEqual(getLoadCount(), 1, 'startNgrokTunnel should attempt lazy SDK load when token exists');
    assertEqual(status.provider, 'ngrok', 'missing SDK should still report ngrok provider');
    assertEqual(status.actualState, 'error', 'missing SDK should produce provider error state');
    assertEqual(status.running, false, 'missing SDK should not report running');
    assertIncludes(status.error || '', 'failed', 'missing SDK should return actionable failure context');
    assertNotIncludes(status.error || '', secretToken, 'missing SDK status should mask authtoken');
    assertNotIncludes(status.error || '', secretBasicAuth, 'missing SDK status should mask basic auth');
    assertNotIncludes(combinedLogs, secretToken, 'missing SDK logs should mask authtoken');
    assertNotIncludes(combinedLogs, secretBasicAuth, 'missing SDK logs should mask basic auth');
  });
}

function testServerDoesNotTopLevelRequireSdk() {
  assert(!/require\((['"])@ngrok\/ngrok\1\)/.test(serverJs), 'server.js must not top-level require @ngrok/ngrok');
  assert(!/from\s+['"]@ngrok\/ngrok['"]/.test(serverJs), 'server.js must not import @ngrok/ngrok');
}

async function main() {
  testServerDoesNotTopLevelRequireSdk();
  await testMissingAuthtokenSkipsWithoutLoadingSdk();
  await testForwardOptionsAndLifecycle();
  await testStopFallsBackToHandleClose();
  await testStopAcceptsRawListenerWithUrlFunction();
  await testStopWithoutCloseDoesNotClaimStopped();
  await testSuccessfulStopRetryClearsPreviousError();
  await testSdkErrorsAreMasked();
  await testMissingSdkReturnsProviderErrorWithoutImportCrash();
  console.log('ngrok manager regression checks passed');
}

main().catch((err) => {
  console.error(err.stack || err.message || String(err));
  process.exit(1);
});
