const fs = require('fs');
const path = require('path');

function readCssFile(filePath, seen = new Set()) {
  const resolved = path.resolve(filePath);
  if (seen.has(resolved)) return '';
  seen.add(resolved);

  const css = fs.readFileSync(resolved, 'utf8');
  const dir = path.dirname(resolved);

  return css.replace(/@import\s+url\((['"]?)([^'")]+)\1\)\s*;/g, (match, _quote, importPath) => {
    if (/^(https?:)?\/\//i.test(importPath)) return match;
    const child = path.resolve(dir, importPath);
    return readCssFile(child, seen);
  });
}

function readPublicCss(root) {
  return readCssFile(path.join(root, 'public', 'style.css'));
}

module.exports = { readPublicCss };
