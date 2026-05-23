#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const serverJs = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const { createAccessManager } = require('../lib/access-manager');

function fakeInterfaces() {
  return {
    lo: [{ family: 'IPv4', address: '127.0.0.1', internal: true }],
    wifi0: [{ family: 'IPv4', address: '192.168.1.23', internal: false }],
    eth0: [{ family: 'IPv4', address: '10.0.0.7', internal: false }],
  };
}

function createLogger() {
  const lines = [];
  return {
    lines,
    logger(message) {
      lines.push(String(message));
    },
  };
}

async function checkDirectLocalStatus() {
  const manager = createAccessManager({
    host: '127.0.0.1',
    port: 8083,
    networkInterfaces: fakeInterfaces(),
    accessConfig: { mode: 'direct', directScope: 'local', publicUrl: '' },
  });
  const status = await manager.start();

  assert.strictEqual(status.mode, 'direct', 'direct/local mode should be direct');
  assert.strictEqual(status.desiredMode, 'direct', 'direct/local desired mode should be direct');
  assert.strictEqual(status.directScope, 'local', 'direct/local scope should be local');
  assert.strictEqual(status.provider, 'none', 'direct/local should not have a provider');
  assert.strictEqual(status.actualState, 'running', 'direct/local should be running without provider');
  assert.deepStrictEqual(status.urls.local, ['http://127.0.0.1:8083'], 'direct/local should expose local URL');
  assert.deepStrictEqual(status.urls.lan, [], 'direct/local should not expose LAN URLs');
  assert.deepStrictEqual(status.urls.remote, [], 'direct/local should not expose remote URLs');
  assert.strictEqual(status.restartRequired, false, 'direct/local should not require restart');
  assert.strictEqual(status.providerRestartRequired, false, 'direct/local should not require provider restart');
}

async function checkDirectLanStatus() {
  const manager = createAccessManager({
    host: '192.168.1.23',
    port: 8083,
    networkInterfaces: fakeInterfaces(),
    accessConfig: { mode: 'direct', directScope: 'lan', publicUrl: '' },
  });
  const status = await manager.start();

  assert.deepStrictEqual(status.urls.local, ['http://192.168.1.23:8083'], 'direct/LAN should still show server local bind URL');
  assert.deepStrictEqual(
    status.urls.lan,
    ['http://192.168.1.23:8083', 'http://10.0.0.7:8083'],
    'direct/LAN should show concrete private LAN URLs',
  );
  assert(status.warnings.length === 0, 'direct/LAN with private interfaces should not warn');
}

async function checkPublicStatus() {
  const manager = createAccessManager({
    host: '127.0.0.1',
    port: 8083,
    networkInterfaces: fakeInterfaces(),
    accessConfig: { mode: 'public', directScope: 'local', publicUrl: 'https://cc.example.com' },
  });
  const status = await manager.start();

  assert.strictEqual(status.mode, 'public', 'public mode should remain public');
  assert.strictEqual(status.provider, 'none', 'public mode should not start a tunnel provider');
  assert.deepStrictEqual(status.urls.public, ['https://cc.example.com'], 'public mode should expose configured public URL');
  assert(
    status.warnings.some((warning) => /127\.0\.0\.1|local-only/i.test(warning)),
    'public mode bound to loopback should warn that it is not publicly reachable',
  );
}

async function checkNgrokLifecycle() {
  const calls = { start: 0, stop: 0 };
  const ngrokManager = {
    async startNgrokTunnel(options) {
      calls.start += 1;
      assert.strictEqual(options.port, 8083, 'ngrok start should receive server port');
      assert.strictEqual(options.authtoken, 'ngrok-token', 'ngrok start should receive resolved token');
      return {
        provider: 'ngrok',
        actualState: 'running',
        running: true,
        url: 'https://demo.ngrok-free.app',
        forwardTo: 'http://127.0.0.1:8083',
        listener: { close() {} },
      };
    },
    async stopNgrokHandle(handle) {
      calls.stop += 1;
      assert(handle, 'ngrok stop should receive active handle');
      handle.actualState = 'stopped';
      handle.running = false;
      return { stopped: true };
    },
    getNgrokStatus(handle) {
      return {
        provider: 'ngrok',
        actualState: handle?.actualState || 'stopped',
        running: !!handle?.running,
        url: handle?.url || '',
        forwardTo: handle?.forwardTo || '',
        reason: '',
        error: '',
        providerError: '',
      };
    },
  };
  const manager = createAccessManager({
    host: '127.0.0.1',
    port: 8083,
    networkInterfaces: fakeInterfaces(),
    ngrokManager,
    accessConfig: {
      mode: 'ngrok',
      directScope: 'local',
      ngrok: { authtoken: 'ngrok-token', autoStart: true },
    },
  });

  const started = await manager.start();
  assert.strictEqual(calls.start, 1, 'ngrok mode should start exactly one tunnel');
  assert.deepStrictEqual(started.urls.remote, ['https://demo.ngrok-free.app'], 'ngrok status should include remote URL');
  assert.strictEqual(started.provider, 'ngrok', 'ngrok status should report provider');
  assert.strictEqual(started.actualState, 'running', 'ngrok status should report running provider');

  await manager.stop();
  const stopped = manager.getStatus();
  assert.strictEqual(calls.stop, 1, 'ngrok stop should close active tunnel once');
  assert.strictEqual(stopped.actualState, 'stopped', 'ngrok stopped status should be stopped');
  assert.strictEqual(stopped.providerRestartRequired, true, 'stopped ngrok provider should require provider restart while desired mode remains ngrok');
  assert.strictEqual(stopped.quickLogin.allowed, false, 'stopped ngrok provider should not allow quick login');
  assert.strictEqual(stopped.quickLogin.reason, 'provider_not_running', 'stopped ngrok provider quick login reason should explain provider state');

  await manager.reload({
    mode: 'ngrok',
    directScope: 'local',
    ngrok: { authtoken: 'ngrok-token', autoStart: true },
  });
  assert.strictEqual(calls.start, 1, 'reload after manual provider stop should not silently restart provider');

  const restarted = await manager.start();
  assert.strictEqual(calls.start, 2, 'explicit start should restart a manually stopped provider');
  assert.strictEqual(restarted.actualState, 'running', 'explicit start after manual stop should return running status');
}

async function checkFrpLifecycle() {
  const calls = { start: 0, stop: 0 };
  const frpHandle = { started: true, runtime: { mode: 'client' } };
  const frpManager = {
    startFrpFromEnv(env, options) {
      calls.start += 1;
      assert.strictEqual(env.FRP_MODE, 'client', 'frp manager should receive environment');
      assert(options.logger, 'frp manager should receive logger');
      return frpHandle;
    },
    stopFrpHandle(handle) {
      calls.stop += 1;
      assert.strictEqual(handle, frpHandle, 'frp stop should receive active frp handle');
      return { stopped: true };
    },
  };
  const manager = createAccessManager({
    env: { FRP_MODE: 'client' },
    host: '127.0.0.1',
    port: 8083,
    networkInterfaces: fakeInterfaces(),
    frpManager,
    accessConfig: {
      mode: 'frp',
      directScope: 'local',
      frp: { autoStart: true },
    },
  });

  const started = await manager.start();
  assert.strictEqual(calls.start, 1, 'frp mode should delegate startup to frp manager');
  assert.strictEqual(started.provider, 'frp', 'frp status should report provider');
  assert.strictEqual(started.actualState, 'running', 'frp started handle should report running');

  await manager.stop();
  assert.strictEqual(calls.stop, 1, 'frp stop should delegate to frp manager');
  assert.strictEqual(manager.getStatus().actualState, 'stopped', 'frp stopped status should be stopped');
}

async function checkProviderSwitchStopsPrevious() {
  const calls = { ngrokStart: 0, ngrokStop: 0, frpStart: 0 };
  const events = [];
  const ngrokManager = {
    async startNgrokTunnel() {
      calls.ngrokStart += 1;
      events.push('ngrok-start');
      return { provider: 'ngrok', actualState: 'running', running: true, url: 'https://demo.ngrok-free.app' };
    },
    async stopNgrokHandle(handle) {
      calls.ngrokStop += 1;
      events.push('ngrok-stop');
      handle.actualState = 'stopped';
      handle.running = false;
      return { stopped: true };
    },
    getNgrokStatus(handle) {
      return { provider: 'ngrok', actualState: handle?.actualState || 'stopped', running: !!handle?.running, url: handle?.url || '' };
    },
  };
  const frpManager = {
    startFrpFromEnv() {
      calls.frpStart += 1;
      events.push('frp-start');
      return { started: true };
    },
    stopFrpHandle() {
      throw new Error('frp stop should not be called before frp starts');
    },
  };
  const manager = createAccessManager({
    host: '127.0.0.1',
    port: 8083,
    ngrokManager,
    frpManager,
    accessConfig: { mode: 'ngrok', directScope: 'local', ngrok: { authtoken: 'token', autoStart: true } },
  });

  await manager.start();
  const reloaded = await manager.reload({ mode: 'frp', directScope: 'local', frp: { autoStart: true } });
  assert.strictEqual(calls.ngrokStop, 1, 'provider switch should stop previous ngrok provider before frp start');
  assert.strictEqual(calls.frpStart, 1, 'provider switch should start new frp provider');
  assert.deepStrictEqual(events, ['ngrok-start', 'ngrok-stop', 'frp-start'], 'provider switch should stop old provider before starting new provider');
  assert.strictEqual(reloaded.provider, 'frp', 'provider switch status should report frp');
}

async function checkProviderSwitchPreservesStopFailure() {
  const calls = { ngrokStop: 0, frpStart: 0 };
  const ngrokManager = {
    async startNgrokTunnel() {
      return {
        provider: 'ngrok',
        actualState: 'running',
        running: true,
        url: 'https://switch-fail.ngrok-free.app',
      };
    },
    async stopNgrokHandle() {
      calls.ngrokStop += 1;
      return { stopped: false, error: 'ngrok close failed before frp start' };
    },
    getNgrokStatus(handle) {
      return {
        provider: 'ngrok',
        actualState: handle?.actualState || 'stopped',
        running: !!handle?.running,
        url: handle?.url || '',
        forwardTo: '',
        reason: '',
        error: handle?.error || '',
        providerError: handle?.providerError || '',
      };
    },
  };
  const frpManager = {
    startFrpFromEnv() {
      calls.frpStart += 1;
      return { started: true };
    },
    stopFrpHandle() {
      throw new Error('frp stop should not be called before frp starts');
    },
  };
  const manager = createAccessManager({
    host: '127.0.0.1',
    port: 8083,
    ngrokManager,
    frpManager,
    accessConfig: { mode: 'ngrok', directScope: 'local', ngrok: { authtoken: 'token', autoStart: true } },
  });

  await manager.start();
  const status = await manager.reload({ mode: 'frp', directScope: 'local', frp: { autoStart: true } });

  assert.strictEqual(calls.ngrokStop, 1, 'provider switch should attempt to stop previous provider once');
  assert.strictEqual(calls.frpStart, 0, 'provider switch should not start new provider after stop failure');
  assert.strictEqual(status.mode, 'ngrok', 'failed provider switch should keep active mode on previous provider');
  assert.strictEqual(status.desiredMode, 'frp', 'failed provider switch should still record desired provider mode');
  assert.strictEqual(status.provider, 'ngrok', 'failed provider switch should not hide previous provider');
  assert.strictEqual(status.actualState, 'error', 'failed provider switch should expose provider error state');
  assert(status.errors.some((error) => /ngrok close failed before frp start/.test(error)), 'failed provider switch should expose stop failure');
}

async function checkProviderSwitchToDirectAppliesDesiredConfig() {
  const calls = { ngrokStart: 0, ngrokStop: 0 };
  const ngrokManager = {
    async startNgrokTunnel() {
      calls.ngrokStart += 1;
      return {
        provider: 'ngrok',
        actualState: 'running',
        running: true,
        url: 'https://switch-direct.ngrok-free.app',
      };
    },
    async stopNgrokHandle(handle) {
      calls.ngrokStop += 1;
      handle.actualState = 'stopped';
      handle.running = false;
      return { stopped: true };
    },
    getNgrokStatus(handle) {
      return {
        provider: 'ngrok',
        actualState: handle?.actualState || 'stopped',
        running: !!handle?.running,
        url: handle?.url || '',
        forwardTo: '',
        reason: '',
        error: handle?.error || '',
        providerError: handle?.providerError || '',
      };
    },
  };
  const manager = createAccessManager({
    host: '127.0.0.1',
    port: 8083,
    networkInterfaces: fakeInterfaces(),
    ngrokManager,
    accessConfig: { mode: 'ngrok', directScope: 'local', ngrok: { authtoken: 'token', autoStart: true } },
  });

  await manager.start();
  const status = await manager.reload({ mode: 'direct', directScope: 'local', publicUrl: '' });

  assert.strictEqual(calls.ngrokStart, 1, 'provider->direct switch should not restart ngrok');
  assert.strictEqual(calls.ngrokStop, 1, 'provider->direct switch should stop active ngrok provider');
  assert.strictEqual(status.mode, 'direct', 'provider->direct switch should apply desired mode as active mode');
  assert.strictEqual(status.desiredMode, 'direct', 'provider->direct switch should keep desired mode direct');
  assert.strictEqual(status.directScope, 'local', 'provider->direct switch should apply desired direct scope');
  assert.strictEqual(status.provider, 'none', 'provider->direct switch should clear active provider');
  assert.strictEqual(status.actualState, 'running', 'provider->direct switch should report running direct access');
  assert.strictEqual(status.providerRestartRequired, false, 'provider->direct switch should not require provider restart');
  assert.deepStrictEqual(status.urls.remote, [], 'provider->direct switch should clear stale remote URL');
}

async function checkProviderStopFailureStatus() {
  const ngrokManager = {
    async startNgrokTunnel() {
      return {
        provider: 'ngrok',
        actualState: 'running',
        running: true,
        url: 'https://stop-fail.ngrok-free.app',
      };
    },
    async stopNgrokHandle() {
      return { stopped: false, error: 'transient stop failure' };
    },
    getNgrokStatus(handle) {
      return {
        provider: 'ngrok',
        actualState: handle?.actualState || 'stopped',
        running: !!handle?.running,
        url: handle?.url || '',
        forwardTo: '',
        reason: '',
        error: handle?.error || '',
        providerError: handle?.providerError || '',
      };
    },
  };
  const manager = createAccessManager({
    host: '127.0.0.1',
    port: 8083,
    ngrokManager,
    accessConfig: { mode: 'ngrok', directScope: 'local', ngrok: { authtoken: 'token', autoStart: true } },
  });

  await manager.start();
  const status = await manager.stop();

  assert.strictEqual(status.actualState, 'error', 'failed provider stop should report error state');
  assert(status.errors.some((error) => /transient stop failure/.test(error)), 'failed provider stop should expose masked provider error');
}

async function checkProviderSwitchToDirectPreservesStopFailure() {
  const calls = { ngrokStop: 0 };
  const ngrokManager = {
    async startNgrokTunnel() {
      return {
        provider: 'ngrok',
        actualState: 'running',
        running: true,
        url: 'https://stop-fail-switch.ngrok-free.app',
      };
    },
    async stopNgrokHandle() {
      calls.ngrokStop += 1;
      return { stopped: false, error: 'close failed while switching' };
    },
    getNgrokStatus(handle) {
      return {
        provider: 'ngrok',
        actualState: handle?.actualState || 'stopped',
        running: !!handle?.running,
        url: handle?.url || '',
        forwardTo: '',
        reason: '',
        error: handle?.error || '',
        providerError: handle?.providerError || '',
      };
    },
  };
  const manager = createAccessManager({
    host: '127.0.0.1',
    port: 8083,
    networkInterfaces: fakeInterfaces(),
    ngrokManager,
    accessConfig: { mode: 'ngrok', directScope: 'local', ngrok: { authtoken: 'token', autoStart: true } },
  });

  await manager.start();
  const status = await manager.reload({ mode: 'direct', directScope: 'local', publicUrl: '' });

  assert.strictEqual(calls.ngrokStop, 1, 'provider->direct switch should attempt to stop the active provider once');
  assert.strictEqual(status.mode, 'ngrok', 'failed provider stop should keep active mode on the still-owned provider');
  assert.strictEqual(status.desiredMode, 'direct', 'failed provider stop should still record the desired direct mode');
  assert.strictEqual(status.provider, 'ngrok', 'failed provider stop should not hide the active provider');
  assert.strictEqual(status.actualState, 'error', 'failed provider stop should expose provider error state');
  assert(status.errors.some((error) => /close failed while switching/.test(error)), 'failed provider stop should expose the stop failure');
  assert.deepStrictEqual(
    status.urls.remote,
    ['https://stop-fail-switch.ngrok-free.app'],
    'failed provider stop should retain the previous remote URL for visibility',
  );
}

async function checkProviderRestartRequiredForSameProviderConfigChange() {
  const calls = { starts: 0, stops: 0 };
  const ngrokManager = {
    async startNgrokTunnel(options) {
      calls.starts += 1;
      return {
        provider: 'ngrok',
        actualState: 'running',
        running: true,
        url: `https://${options.authtoken}.ngrok-free.app`,
        forwardTo: 'http://127.0.0.1:8083',
      };
    },
    async stopNgrokHandle() {
      calls.stops += 1;
      return { stopped: true };
    },
    getNgrokStatus(handle) {
      return {
        provider: 'ngrok',
        actualState: handle?.actualState || 'stopped',
        running: !!handle?.running,
        url: handle?.url || '',
        forwardTo: handle?.forwardTo || '',
        reason: '',
        error: '',
        providerError: '',
      };
    },
  };
  const manager = createAccessManager({
    host: '127.0.0.1',
    port: 8083,
    ngrokManager,
    accessConfig: { mode: 'ngrok', directScope: 'local', ngrok: { authtoken: 'token-a', autoStart: true } },
  });

  await manager.start();
  const status = await manager.reload({
    mode: 'ngrok',
    directScope: 'local',
    ngrok: { authtoken: 'token-b', autoStart: true },
  });

  assert.strictEqual(calls.starts, 1, 'same-provider config reload should not silently restart provider');
  assert.strictEqual(calls.stops, 0, 'same-provider config reload should not silently stop provider');
  assert.strictEqual(status.mode, 'ngrok', 'active mode should remain ngrok');
  assert.strictEqual(status.desiredMode, 'ngrok', 'desired mode should remain ngrok');
  assert.strictEqual(status.providerRestartRequired, true, 'same-provider config reload should mark provider restart required');
  assert.deepStrictEqual(
    status.urls.remote,
    ['https://token-a.ngrok-free.app'],
    'same-provider config reload should keep current provider URL until explicit restart',
  );

  const restarted = await manager.start();
  assert.strictEqual(calls.stops, 1, 'explicit restart after same-provider config reload should stop old provider');
  assert.strictEqual(calls.starts, 2, 'explicit restart after same-provider config reload should start new provider');
  assert.strictEqual(restarted.providerRestartRequired, false, 'explicit provider restart should clear restart-required status');
  assert.deepStrictEqual(
    restarted.urls.remote,
    ['https://token-b.ngrok-free.app'],
    'explicit provider restart should expose URL from the new provider config',
  );
}

async function checkRestartRequiredForDirectScopeBindChange() {
  const manager = createAccessManager({
    host: '127.0.0.1',
    port: 8083,
    networkInterfaces: fakeInterfaces(),
    accessConfig: { mode: 'direct', directScope: 'local' },
  });

  await manager.start();
  const status = await manager.reload({ mode: 'direct', directScope: 'lan' });
  assert.strictEqual(status.directScope, 'local', 'active direct scope should remain local until server restart');
  assert.strictEqual(status.restartRequired, true, 'direct local->LAN bind change should require server restart');
}

async function checkProviderDisabledAndQuickLoginPolicy() {
  const calls = { ngrokStart: 0, ngrokStop: 0 };
  const ngrokManager = {
    async startNgrokTunnel() {
      calls.ngrokStart += 1;
      return {
        provider: 'ngrok',
        actualState: 'running',
        running: true,
        url: 'https://manual-start.ngrok-free.app',
      };
    },
    async stopNgrokHandle(handle) {
      calls.ngrokStop += 1;
      assert(handle, 'manual stop after start should receive active ngrok handle');
      handle.actualState = 'stopped';
      handle.running = false;
      return { stopped: true };
    },
    getNgrokStatus(handle) {
      return {
        provider: 'ngrok',
        actualState: handle?.actualState || 'stopped',
        running: !!handle?.running,
        url: handle?.url || '',
        forwardTo: '',
        reason: '',
        error: '',
        providerError: '',
      };
    },
  };
  const manager = createAccessManager({
    host: '127.0.0.1',
    port: 8083,
    ngrokManager,
    accessConfig: { mode: 'ngrok', directScope: 'local', ngrok: { authtoken: 'token', autoStart: false } },
  });
  const stopped = await manager.start();
  assert.strictEqual(stopped.actualState, 'stopped', 'provider autoStart=false should report stopped, not skipped');
  assert.strictEqual(stopped.quickLogin.allowed, false, 'stopped provider should not allow quick login');
  assert.strictEqual(stopped.quickLogin.reason, 'provider_not_running', 'stopped provider quick login should explain provider state');

  const alreadyStopped = await manager.stop();
  assert.strictEqual(calls.ngrokStop, 0, 'stopping an already-stopped provider should be idempotent');
  assert.strictEqual(alreadyStopped.actualState, 'stopped', 'idempotent stop should preserve stopped status');
  assert.strictEqual(alreadyStopped.errors.length, 0, 'idempotent stop should not report provider error');

  const manuallyStarted = await manager.start({ manual: true });
  assert.strictEqual(calls.ngrokStart, 1, 'manual start should override provider autoStart=false');
  assert.strictEqual(manuallyStarted.actualState, 'running', 'manual start should return running provider status');
  assert.deepStrictEqual(manuallyStarted.urls.remote, ['https://manual-start.ngrok-free.app'], 'manual start should expose provider URL');

  const publicHttp = createAccessManager({
    host: '0.0.0.0',
    port: 8083,
    networkInterfaces: fakeInterfaces(),
    accessConfig: { mode: 'public', directScope: 'local', publicUrl: 'http://cc.example.com' },
  });
  const publicStatus = await publicHttp.start();
  assert.strictEqual(publicStatus.quickLogin.allowed, false, 'plain public HTTP should not allow quick login');
  assert.strictEqual(publicStatus.quickLogin.reason, 'public_http_disabled', 'plain public HTTP should report quick-login policy reason');
}

function checkServerUsesAccessManager() {
  assert(
    /createAccessManager/.test(serverJs),
    'server.js should create the unified access manager',
  );
  assert(
    !/startFrpFromEnv\s*\(/.test(serverJs),
    'server.js should not call startFrpFromEnv directly outside access-manager',
  );
  assert(
    !/stopFrpHandle\s*\(/.test(serverJs),
    'server.js should not call stopFrpHandle directly outside access-manager',
  );
  assert(
    /await\s+Promise\.resolve\(accessManager\.stop\(\)\)/.test(serverJs),
    'server shutdown should await asynchronous accessManager.stop()',
  );
}

async function main() {
  checkServerUsesAccessManager();
  await checkDirectLocalStatus();
  await checkDirectLanStatus();
  await checkPublicStatus();
  await checkNgrokLifecycle();
  await checkFrpLifecycle();
  await checkProviderSwitchStopsPrevious();
  await checkProviderSwitchPreservesStopFailure();
  await checkProviderSwitchToDirectAppliesDesiredConfig();
  await checkProviderStopFailureStatus();
  await checkProviderSwitchToDirectPreservesStopFailure();
  await checkProviderRestartRequiredForSameProviderConfigChange();
  await checkRestartRequiredForDirectScopeBindChange();
  await checkProviderDisabledAndQuickLoginPolicy();
  console.log('access manager regression checks passed');
}

main().catch((err) => {
  console.error(err.stack || err.message || String(err));
  process.exit(1);
});
