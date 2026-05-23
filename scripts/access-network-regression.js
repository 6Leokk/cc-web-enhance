#!/usr/bin/env node

const assert = require('assert');

const {
  buildLanUrls,
  buildLocalUrls,
  getPrivateIpv4Addresses,
  isPrivateIpv4,
  recommendLanBindHost,
} = require('../lib/access-network');
const { resolveServerBindConfig } = require('../lib/server-config');

function fakeInterfaces() {
  return {
    lo: [
      { family: 'IPv4', address: '127.0.0.1', internal: true },
      { family: 'IPv6', address: '::1', internal: true },
    ],
    wifi0: [
      { family: 'IPv4', address: '192.168.1.23', internal: false },
      { family: 'IPv6', address: 'fe80::1', internal: false },
    ],
    eth0: [
      { family: 'IPv4', address: '10.0.0.7', internal: false },
      { family: 'IPv4', address: '8.8.8.8', internal: false },
      { family: 'IPv4', address: '192.168.1.23', internal: false },
    ],
    vmnet: [
      { family: 'IPv4', address: '172.20.10.5', internal: false },
    ],
  };
}

function checkPrivateDetection() {
  assert.strictEqual(isPrivateIpv4('10.2.3.4'), true, '10/8 should be private');
  assert.strictEqual(isPrivateIpv4('172.16.0.1'), true, '172.16/12 lower bound should be private');
  assert.strictEqual(isPrivateIpv4('172.31.255.1'), true, '172.16/12 upper bound should be private');
  assert.strictEqual(isPrivateIpv4('192.168.1.1'), true, '192.168/16 should be private');
  assert.strictEqual(isPrivateIpv4('172.32.0.1'), false, '172.32/16 should not be private');
  assert.strictEqual(isPrivateIpv4('8.8.8.8'), false, 'public IPv4 should not be private');
  assert.strictEqual(isPrivateIpv4('::1'), false, 'IPv6 should not be treated as private IPv4');
}

function checkPrivateAddressDiscovery() {
  const addresses = getPrivateIpv4Addresses(fakeInterfaces());
  assert.deepStrictEqual(
    addresses,
    ['192.168.1.23', '10.0.0.7', '172.20.10.5'],
    'private IPv4 discovery should preserve order, skip duplicates, loopback, public IPs, and IPv6',
  );
}

function checkUrlRendering() {
  assert.deepStrictEqual(
    buildLocalUrls('127.0.0.1', 8083),
    ['http://127.0.0.1:8083'],
    'local URL should render loopback host',
  );
  assert.deepStrictEqual(
    buildLocalUrls('0.0.0.0', 8083),
    ['http://127.0.0.1:8083'],
    'wildcard bind should render loopback as local URL',
  );
  assert.deepStrictEqual(
    buildLanUrls(8083, fakeInterfaces()),
    ['http://192.168.1.23:8083', 'http://10.0.0.7:8083', 'http://172.20.10.5:8083'],
    'LAN URLs should use concrete private addresses',
  );
  for (const url of buildLanUrls(8083, fakeInterfaces())) {
    assert(!url.includes('0.0.0.0'), 'LAN URLs must never contain 0.0.0.0');
  }
}

function checkLanBindRecommendation() {
  assert.strictEqual(
    recommendLanBindHost(fakeInterfaces()),
    '192.168.1.23',
    'LAN bind recommendation should use the first private IPv4',
  );
  assert.strictEqual(
    recommendLanBindHost({
      eth0: [{ family: 'IPv4', address: '8.8.8.8', internal: false }],
    }),
    '',
    'LAN bind recommendation should be empty when no private IPv4 exists',
  );
}

function checkServerBindHints() {
  const lanConfig = { mode: 'direct', directScope: 'lan' };
  const localConfig = { mode: 'direct', directScope: 'local' };

  const lan = resolveServerBindConfig({}, {
    accessConfig: lanConfig,
    networkInterfaces: fakeInterfaces(),
  });
  assert.strictEqual(lan.host, '192.168.1.23', 'direct LAN mode should use recommended private bind host');
  assert.strictEqual(lan.port, 8083, 'default port should remain unchanged');

  const noPrivateFallback = resolveServerBindConfig({}, {
    accessConfig: lanConfig,
    networkInterfaces: { eth0: [{ family: 'IPv4', address: '8.8.8.8', internal: false }] },
  });
  assert.strictEqual(noPrivateFallback.host, '127.0.0.1', 'LAN mode should fall back to local when no private interface exists');

  const local = resolveServerBindConfig({}, {
    accessConfig: localConfig,
    networkInterfaces: fakeInterfaces(),
  });
  assert.strictEqual(local.host, '127.0.0.1', 'direct local mode should keep local bind');

  const explicitCcWeb = resolveServerBindConfig({
    CC_WEB_HOST: '127.0.0.2',
    CC_WEB_PORT: '18083',
  }, {
    accessConfig: lanConfig,
    networkInterfaces: fakeInterfaces(),
  });
  assert.strictEqual(explicitCcWeb.host, '127.0.0.2', 'CC_WEB_HOST must override LAN recommendation');
  assert.strictEqual(explicitCcWeb.port, 18083, 'CC_WEB_PORT must still parse');

  const legacyHost = resolveServerBindConfig({
    HOST: '127.0.0.3',
  }, {
    accessConfig: lanConfig,
    networkInterfaces: fakeInterfaces(),
  });
  assert.strictEqual(legacyHost.host, '127.0.0.3', 'legacy HOST must override LAN recommendation');
}

checkPrivateDetection();
checkPrivateAddressDiscovery();
checkUrlRendering();
checkLanBindRecommendation();
checkServerBindHints();

console.log('access network regression checks passed');
