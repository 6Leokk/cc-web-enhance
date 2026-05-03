#!/usr/bin/env node

const path = require('path');
const {
  readEnvFile,
  resolveFrpConfig,
  writeFrpConfig,
} = require('../lib/frp-config');

const REPO_ROOT = path.resolve(__dirname, '..');

function main() {
  const env = readEnvFile(path.join(REPO_ROOT, '.env'), process.env);
  const config = resolveFrpConfig(env, { defaultMode: 'client' });
  const result = writeFrpConfig(config);
  if (result.skipped) {
    console.log('frp setup skipped because FRP_MODE=disabled');
    return;
  }
  console.log(`frp ${config.mode} config written to ${path.relative(REPO_ROOT, result.configPath)}`);
  console.log(`frp type: ${config.type}`);
  if (result.hasPlaceholders) {
    console.log('Config contains YOUR_* placeholders. Replace them in .env and rerun setup before production use.');
  }
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error(err.stack || err.message);
    process.exit(1);
  }
}
