#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { readPublicCss } = require('./read-public-css');

const root = path.resolve(__dirname, '..');
const appJs = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
const styleCss = readPublicCss(root);
const indexHtml = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
const themeCss = fs.readFileSync(path.join(root, 'public', 'styles', '10-theme-current.css'), 'utf8');
const layoutCss = fs.readFileSync(path.join(root, 'public', 'styles', '20-base-layout.css'), 'utf8');
const inputCss = fs.readFileSync(path.join(root, 'public', 'styles', '40-input-overlays.css'), 'utf8');
const chatToolsCss = fs.readFileSync(path.join(root, 'public', 'styles', '30-chat-tools.css'), 'utf8');
const settingsCss = fs.readFileSync(path.join(root, 'public', 'styles', '50-settings-modals.css'), 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(appJs.includes("value: 'mono-night'"), 'Mono Night theme option is missing');
assert(appJs.includes("value: 'system'"), 'System theme option is missing');
assert(/function\s+resolveThemeValue\s*\(/.test(appJs), 'Theme resolver is missing');
assert(/prefers-color-scheme:\s*dark/.test(appJs), 'System dark mode media query is missing in app.js');
assert(/systemThemeQuery\.addEventListener\('change'/.test(appJs), 'System theme change listener is missing');
assert(/document\.documentElement\.dataset\.theme\s*=\s*resolveThemeValue\(currentTheme\)/.test(appJs), 'Resolved theme should be applied to html');
assert(styleCss.includes("html[data-theme='mono-night']"), 'Mono Night CSS theme block is missing');
assert(styleCss.includes('color-scheme: dark'), 'Mono Night should opt into dark form controls');
assert(indexHtml.includes('resolveThemeValue'), 'Initial theme script should resolve system theme before CSS loads');
assert(/localStorage\.getItem\('cc-web-theme'\)\s*\|\|\s*'system'/.test(indexHtml), 'Initial theme should default to system');
assert(
  themeCss.includes('--tool-call-command-bg') &&
    themeCss.includes('--tool-call-code-bg') &&
    themeCss.includes('--settings-nav-card-bg') &&
    themeCss.includes('--settings-back-bg'),
  'theme token file should define semantic tokens for the next CSS decoupling slice',
);
assert(
  !/html\[data-theme=/.test(chatToolsCss),
  'theme selectors should not leak into chat tool component CSS once the semantic token slice lands',
);
assert(
  !/html\[data-theme=/.test(settingsCss),
  'theme selectors should not leak into settings/modal component CSS once the semantic token slice lands',
);

[
  '--panel-surface-bg',
  '--panel-surface-border',
  '--panel-surface-shadow',
  '--sidebar-surface-bg',
  '--sidebar-section-bg',
  '--sidebar-section-border',
  '--empty-state-bg',
  '--session-item-hover-bg',
  '--session-item-active-bg',
  '--chat-control-bg',
  '--chat-control-hover-bg',
  '--status-chip-bg',
  '--cwd-chip-bg',
  '--input-area-surface-bg',
  '--input-surface-bg',
  '--input-surface-focus-shadow',
].forEach((token) => {
  assert(themeCss.includes(token), `theme token file should define ${token} for the shared-surface convergence slice`);
});

[
  "html[data-theme='coolvibe'] .login-box,",
  "html[data-theme='coolvibe'] .sidebar {",
  "html[data-theme='coolvibe'] .sidebar-header,",
  "html[data-theme='coolvibe'] .brand {",
  "html[data-theme='coolvibe'] .session-list-empty,",
  "html[data-theme='coolvibe'] .session-item {",
  "html[data-theme='coolvibe'] .session-item:hover {",
  "html[data-theme='coolvibe'] .session-item.active {",
  "html[data-theme='coolvibe'] .session-item.active .session-item-title {",
  "html[data-theme='coolvibe'] .chat-agent-btn,",
  "html[data-theme='coolvibe'] .chat-runtime-state {",
  "html[data-theme='coolvibe'] .chat-cwd {",
  "html[data-theme='coolvibe'] .input-area {",
  "html[data-theme='coolvibe'] .input-wrapper {",
  "html[data-theme='coolvibe'] .input-wrapper:focus-within {",
  "html[data-theme='mono-night'] .session-list-empty,",
  "html[data-theme='mono-night'] .session-item:hover,",
  "html[data-theme='mono-night'] .session-item.active {",
  "html[data-theme='mono-night'] .session-item.active .session-item-title {",
  "html[data-theme='mono-night'] .session-item-status,",
  "html[data-theme='mono-night'] .login-box,",
  "html[data-theme='mono-night'] .login-box input,",
  "html[data-theme='mono-night'] .chat-agent-btn {",
  "html[data-theme='mono-night'] .chat-runtime-state,",
].forEach((selector) => {
  assert(!themeCss.includes(selector), `theme file should not keep direct component styling for ${selector}`);
});

assert(
  !/html\[data-theme='coolvibe'\]\s+(body|\.)/.test(themeCss),
  'theme file should not keep any coolvibe component/body selector overrides once convergence is complete',
);
assert(
  !/html\[data-theme='mono-night'\]\s+\./.test(themeCss),
  'theme file should not keep any mono-night component selector overrides once convergence is complete',
);

assert(layoutCss.includes('var(--panel-surface-bg)'), 'layout CSS should consume panel surface tokens');
assert(layoutCss.includes('var(--sidebar-surface-bg)'), 'layout CSS should consume sidebar surface tokens');
assert(layoutCss.includes('var(--session-item-hover-bg)'), 'layout CSS should consume session item tokens');
assert(layoutCss.includes('var(--chat-control-bg)'), 'layout CSS should consume chat control tokens');
assert(inputCss.includes('var(--input-surface-bg)'), 'input/overlay CSS should consume input surface tokens');

console.log('theme regression checks passed');
