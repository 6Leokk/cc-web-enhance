#!/usr/bin/env node

const { getFrpStatus, loadConfigForCli, startFrp, stopFrpPid } = require('../lib/frp-manager');

function usage() {
  console.error('Usage: node scripts/frp-control.js <start|stop|status>');
  process.exit(2);
}

function main() {
  const command = process.argv[2];
  if (!['start', 'stop', 'status'].includes(command)) usage();
  const config = loadConfigForCli('client');

  if (command === 'start') {
    const result = startFrp(config, { strict: true, detached: true });
    console.log(`frp ${result.runtime.binaryName} started pid=${result.child.pid}`);
    return;
  }

  if (command === 'stop') {
    const result = stopFrpPid(config);
    if (result.stopped) console.log(`frp stopped pid=${result.pid}`);
    else console.log(`frp not stopped: ${result.reason}`);
    return;
  }

  const status = getFrpStatus(config);
  if (status.running) console.log(`frp ${status.runtime.binaryName} running pid=${status.pid}`);
  else console.log(`frp not running: ${status.reason}`);
}

try {
  main();
} catch (err) {
  console.error(err.stack || err.message);
  process.exit(1);
}
