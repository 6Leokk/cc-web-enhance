#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const appJs = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(
  /let\s+shouldAnchorBottomOnForegroundReturn\s*=\s*false/.test(appJs),
  'foreground restore should track an explicit anchor-on-return intent flag',
);

assert(
  /document\.visibilityState\s*===\s*'hidden'[\s\S]*shouldAnchorBottomOnForegroundReturn\s*=\s*messagesWereNearBottomBeforeHidden/.test(appJs),
  'hide-time foreground intent should be captured from the pre-background bottom state',
);

assert(
  /document\.visibilityState\s*!==\s*'visible'\s*\)\s*return;[\s\S]*shouldAnchorBottomOnForegroundReturn/.test(appJs),
  'visible foreground restore path should key off the dedicated foreground intent flag',
);

assert(
  !/function\s+handleViewportResize\(\)[\s\S]*document\.activeElement\s*===\s*msgInput/.test(appJs),
  'viewport resize handling should not treat composer focus as a strong signal for foreground bottom anchoring',
);

assert(
  /window\.addEventListener\('pageshow'[\s\S]*shouldAnchorBottomOnForegroundReturn/.test(appJs),
  'pageshow handling should respect the dedicated foreground-return anchor intent',
);

console.log('foreground restore regression checks passed');
