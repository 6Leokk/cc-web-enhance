#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const frpDownload = require('./frp-download');
const frpConfig = require('../lib/frp-config');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function read(filePath) {
  return fs.readFileSync(path.join(root, filePath), 'utf8');
}

function checkDownloadHelpers() {
  assert(
    frpDownload.normalizeTargetArch('linux-amd64') === 'linux_amd64',
    'linux-amd64 should map to frp linux_amd64 suffix',
  );
  assert(
    frpDownload.normalizeTargetArch('darwin-arm64') === 'darwin_arm64',
    'darwin-arm64 should map to frp darwin_arm64 suffix',
  );
  assert(
    frpDownload.assetNameFor({ version: '0.68.1', targetArch: 'linux_amd64' }) === 'frp_0.68.1_linux_amd64.tar.gz',
    'linux asset name should match official frp release naming',
  );
  assert(
    frpDownload.assetNameFor({ version: '0.68.1', targetArch: 'windows_amd64' }) === 'frp_0.68.1_windows_amd64.zip',
    'windows asset name should use zip',
  );
}

function checkGitignore() {
  const gitignore = read('.gitignore');
  for (const pattern of ['frp/bin/*', 'frp/conf/*', 'frp/logs/*', 'frp/run/*', 'frp/tmp/*']) {
    assert(gitignore.includes(pattern), `.gitignore should ignore ${pattern}`);
  }
}

function checkPackageScripts() {
  const pkg = JSON.parse(read('package.json'));
  assert(pkg.scripts['frp:download'] === 'node scripts/frp-download.js', 'package should expose frp:download');
  assert(pkg.scripts['frp:setup'] === 'node scripts/frp-setup.js', 'package should expose frp:setup');
}

function checkConfigRendering() {
  const ip = frpConfig.resolveFrpConfig({
    FRP_MODE: 'client',
    FRP_TYPE: 'ip',
    FRP_SERVER_ADDR: 'YOUR_FRP_SERVER_IP',
    FRP_SERVER_PORT: '7000',
    FRP_TOKEN: 'YOUR_FRP_TOKEN',
    FRP_PUBLIC_PORT: '18083',
    FRP_LOCAL_IP: '127.0.0.1',
    FRP_LOCAL_PORT: '8083',
  });
  const ipToml = frpConfig.renderFrpToml(ip);
  assert(ipToml.includes('serverAddr = "YOUR_FRP_SERVER_IP"'), 'client/ip config should set serverAddr');
  assert(ipToml.includes('remotePort = 18083'), 'client/ip config should set remotePort');
  assert(ipToml.includes('localIP = "127.0.0.1"'), 'client/ip config should use loopback localIP');
  assert(ipToml.includes('localPort = 8083'), 'client/ip config should use localPort 8083');

  const domain = frpConfig.resolveFrpConfig({
    FRP_MODE: 'client',
    FRP_TYPE: 'domain',
    FRP_SERVER_ADDR: 'YOUR_FRP_SERVER_IP',
    FRP_TOKEN: 'YOUR_FRP_TOKEN',
    FRP_CUSTOM_DOMAIN: 'YOUR_DOMAIN',
  });
  const domainToml = frpConfig.renderFrpToml(domain);
  assert(domainToml.includes('type = "http"'), 'client/domain config should use http proxy');
  assert(domainToml.includes('customDomains = ["YOUR_DOMAIN"]'), 'client/domain config should set customDomains');

  const server = frpConfig.resolveFrpConfig({
    FRP_MODE: 'server',
    FRP_BIND_PORT: '7000',
    FRP_TOKEN: 'YOUR_FRP_TOKEN',
    FRP_VHOST_HTTP_PORT: '8080',
  });
  const serverToml = frpConfig.renderFrpToml(server);
  assert(serverToml.includes('bindPort = 7000'), 'server config should set bindPort');
  assert(serverToml.includes('auth.token = "YOUR_FRP_TOKEN"'), 'server config should set token placeholder');
  assert(serverToml.includes('vhostHTTPPort = 8080'), 'server config should support vhostHTTPPort');
  assert(!serverToml.includes('dashboardPort ='), 'server config should not enable dashboard by default');

  const extra = frpConfig.resolveFrpConfig({
    FRP_MODE: 'client',
    FRP_TYPE: 'ip',
    FRP_EXTRA_TOML: '# native frp option\ntransport.tls.enable = true',
  });
  const extraToml = frpConfig.renderFrpToml(extra);
  assert(extraToml.includes('transport.tls.enable = true'), 'config should preserve native frp extra TOML');
}

checkDownloadHelpers();
checkGitignore();
checkPackageScripts();
checkConfigRendering();

console.log('frp builtin regression checks passed');
