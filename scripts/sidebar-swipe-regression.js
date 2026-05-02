const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const appJs = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

assert(
  appJs.includes('SIDEBAR_SWIPE_STORAGE_KEY'),
  'sidebar swipe preference storage key is missing',
);

assert(
  /let\s+sidebarSwipeEnabled\s*=\s*localStorage\.getItem\(SIDEBAR_SWIPE_STORAGE_KEY\)\s*===\s*'1'/.test(appJs),
  'sidebar swipe preference should default to off and enable only when localStorage is "1"',
);

assert(
  appJs.includes('id="sidebar-swipe-toggle"'),
  'settings UI toggle for sidebar swipe gestures is missing',
);

assert(
  appJs.includes('侧栏滑动手势'),
  'settings UI label for sidebar swipe gestures is missing',
);

assert(
  /function\s+handleSidebarSwipeStart\(e\)\s*{[\s\S]*?if\s*\(!sidebarSwipeEnabled\)\s*{[\s\S]*?sidebarSwipe\s*=\s*null;[\s\S]*?return;[\s\S]*?}/.test(appJs),
  'touchstart handler must block both open and close swipe gestures when disabled',
);

assert(
  /const\s+shouldOpen\s*=\s*sidebarSwipe\.mode\s*===\s*'open'/.test(appJs),
  'enabled swipe mode should still support right-swipe opening',
);

assert(
  /const\s+shouldClose\s*=\s*sidebarSwipe\.mode\s*===\s*'close'/.test(appJs),
  'enabled swipe mode should still support left-swipe closing',
);

console.log('sidebar swipe regression checks passed');
