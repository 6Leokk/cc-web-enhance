#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const appJs = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
const indexHtml = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(
  /purify(\.min)?\.js/i.test(indexHtml),
  'DOMPurify should be loaded before app.js so browser-side markdown HTML can be sanitized',
);

assert(
  /renderer\.html\s*=\s*function\s*\(/.test(appJs),
  'marked renderer should override raw HTML token rendering instead of trusting arbitrary HTML',
);

assert(
  /function\s+sanitizeRenderedMarkdown\s*\(/.test(appJs) &&
    /DOMPurify\.sanitize\(/.test(appJs),
  'rendered markdown should pass through a dedicated sanitizer before hitting innerHTML',
);

assert(
  !/function\s+renderMarkdown\s*\(text\)\s*\{[\s\S]*return\s+marked\.parse\(text\);\s*\}/.test(appJs),
  'renderMarkdown must not return marked.parse(text) directly',
);

console.log('markdown security regression checks passed');
