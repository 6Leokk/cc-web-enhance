#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { readPublicCss } = require('./read-public-css');

const root = path.resolve(__dirname, '..');
const appJs = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
const serverJs = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const styleCss = readPublicCss(root);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const visibilityHandler = appJs.match(/document\.addEventListener\('visibilitychange',\s*\(\)\s*=>\s*{[\s\S]*?\n\s*}\);/);

assert(visibilityHandler, 'visibilitychange foreground sync handler is missing');
assert(
  !/beginSessionSwitch\(currentSessionId/.test(visibilityHandler[0]),
  'returning to the foreground must not force an idle current session to re-render',
);
assert(
  /send\(\{\s*type:\s*'list_sessions'\s*\}\)/.test(visibilityHandler[0]),
  'returning to the foreground should refresh lightweight session metadata',
);
assert(
  /isGenerating\s*\|\|\s*currentSessionRunning/.test(visibilityHandler[0]) &&
    /send\(\{\s*type:\s*'load_session',\s*sessionId:\s*currentSessionId\s*\}\)/.test(visibilityHandler[0]),
  'returning to the foreground should reload only active/running sessions',
);

assert(
  /function\s+isNearMessagesBottom\(\)/.test(appJs),
  'mobile viewport handling needs an explicit bottom-distance check',
);
assert(
  /function\s+handleViewportResize\(\)/.test(appJs),
  'mobile keyboard/viewport resize handler is missing',
);
assert(
  /function\s+captureViewportBottomIntent\(\)/.test(appJs),
  'viewport change handling should capture bottom intent before orientation or viewport resize shifts scrollTop',
);
assert(
  /let\s+messagesWereNearBottomBeforeHidden\s*=\s*true/.test(appJs),
  'foreground restore must remember whether the chat was near bottom before the page was hidden',
);
assert(
  /let\s+messagesWereNearBottomBeforeViewportChange\s*=\s*true/.test(appJs),
  'orientation and viewport changes should remember pre-resize bottom intent separately from foreground restore',
);
assert(
  /let\s+isUserAtMessagesBottom\s*=\s*true/.test(appJs),
  'foreground restore must track user bottom intent independently from browser-restored scrollTop',
);
assert(
  /function\s+updateUserBottomState\(\)/.test(appJs),
  'message scrolling should maintain an explicit user-at-bottom state',
);
assert(
  /messagesDiv\.addEventListener\('scroll'[\s\S]*updateUserBottomState\(\)/.test(appJs),
  'message scroll handler should refresh the explicit user-at-bottom state',
);
assert(
  /document\.visibilityState\s*===\s*'hidden'[\s\S]*messagesWereNearBottomBeforeHidden\s*=\s*isUserAtMessagesBottom\s*\|\|\s*isNearMessagesBottom\(\)/.test(appJs),
  'visibilitychange hidden path should capture the pre-background bottom intent',
);
assert(
  /window\.addEventListener\('pagehide'[\s\S]*messagesWereNearBottomBeforeHidden\s*=\s*isUserAtMessagesBottom\s*\|\|\s*isNearMessagesBottom\(\)/.test(appJs),
  'pagehide should also capture the pre-background bottom intent for mobile bfcache restores',
);
assert(
  /function\s+forceMessagesBottomAfterForeground\(\)/.test(appJs),
  'foreground restore needs a forced bottom-anchor helper that does not depend on the already-restored scrollTop',
);
assert(
  /for\s*\(const\s+delay\s+of\s+\[0,\s*80,\s*240,\s*600,\s*1000\]\)/.test(appJs),
  'foreground bottom anchoring should repeat while mobile viewport restoration settles',
);
assert(
  /let\s+viewportAnchorTimers\s*=\s*\[\]/.test(appJs),
  'foreground bottom anchoring should track all delayed timers so they can be cleared together',
);
assert(
  /let\s+foregroundAnchorUntil\s*=\s*0/.test(appJs),
  'foreground bottom anchoring should keep a short active window for late browser scroll restoration',
);
assert(
  /function\s+clearViewportAnchorTimers\(\)/.test(appJs),
  'foreground bottom anchoring should expose a helper to clear all delayed timers',
);
assert(
  /function\s+cancelForegroundBottomAnchor\(\)/.test(appJs),
  'foreground bottom anchoring should be cancellable by real user scroll intent',
);
assert(
  /messagesDiv\.addEventListener\('touchstart',\s*cancelForegroundBottomAnchor/.test(appJs) &&
    /messagesDiv\.addEventListener\('wheel',\s*cancelForegroundBottomAnchor/.test(appJs),
  'user touch/wheel on the message list should cancel delayed foreground bottom anchoring',
);
assert(
  /messagesWereNearBottomBeforeHidden[\s\S]*forceMessagesBottomAfterForeground\(\)/.test(appJs),
  'visible foreground path should force bottom anchoring when the page was hidden from the bottom',
);
assert(
  /visualViewport[\s\S]*addEventListener\('resize',\s*handleViewportResize/.test(appJs),
  'visualViewport resize must be handled for mobile keyboard changes',
);
assert(
  /window\.addEventListener\('orientationchange'[\s\S]*captureViewportBottomIntent\(\)/.test(appJs),
  'orientation changes should capture bottom intent before delayed bottom anchoring runs',
);
assert(
  /msgInput\.addEventListener\('focus'[\s\S]*captureViewportBottomIntent\(\)[\s\S]*handleViewportResize/.test(appJs),
  'focusing the composer should schedule bottom anchoring before the keyboard settles',
);
assert(
  /function\s+handleViewportResize\(\)[\s\S]*messagesWereNearBottomBeforeViewportChange[\s\S]*forceMessagesBottomAfterForeground\(\)/.test(appJs),
  'viewport resize handling should reuse the pre-change bottom intent instead of only trusting the already-shifted scroll position',
);
assert(
  /function\s+scrollToBottom\(\)[\s\S]*isUserAtMessagesBottom\s*=\s*true/.test(appJs),
  'programmatic scrollToBottom should keep the explicit bottom state in sync',
);
assert(
  /function\s+shouldApplySessionInfo\(msg\)/.test(appJs) &&
    /case 'session_info':[\s\S]*shouldApplySessionInfo\(msg\)/.test(appJs),
  'left sidebar session switches must ignore stale session_info responses from older load requests',
);
assert(
  /let\s+sessionLoadRequestSeq\s*=\s*0/.test(appJs) &&
    /const\s+requestId\s*=\s*`\$\{Date\.now\(\)\}-\$\{\+\+sessionLoadRequestSeq\}`/.test(appJs) &&
    /send\(\{\s*type:\s*'load_session',\s*sessionId,\s*requestId\s*\}\)/.test(appJs),
  'left sidebar session switches should tag every load_session request with a unique requestId',
);
assert(
  /function\s+shouldApplySessionInfo\(msg\)[\s\S]*msg\?\.requestId[\s\S]*activeSessionLoad\.requestId\s*===\s*msg\.requestId/.test(appJs) &&
    /case 'session_info':[\s\S]*shouldApplySessionInfo\(msg\)/.test(appJs),
  'session_info handling should accept only the active requestId when one is present',
);
assert(
  /function\s+shouldApplySessionHistoryChunk\(msg\)[\s\S]*msg\?\.requestId[\s\S]*activeSessionLoad\.requestId\s*===\s*msg\.requestId/.test(appJs) &&
    /case 'session_history_chunk':[\s\S]*shouldApplySessionHistoryChunk\(msg\)/.test(appJs),
  'session_history_chunk handling should accept only the active requestId when one is present',
);
assert(
  /function\s+handleLoadSession\(ws,\s*sessionId,\s*requestId/.test(serverJs) &&
    /type:\s*'session_info'[\s\S]*requestId/.test(serverJs) &&
    /type:\s*'session_history_chunk'[\s\S]*requestId/.test(serverJs),
  'server should echo load_session requestId on session_info and session_history_chunk responses',
);
assert(
  /function\s+forceMessagesBottomAfterSessionSwitch\(\)[\s\S]*forceMessagesBottomAfterForeground\(\)/.test(appJs) &&
    /function\s+finishSessionSwitch\(sessionId\)[\s\S]*forceMessagesBottomAfterSessionSwitch\(\)/.test(appJs),
  'blocking session switches should keep the view anchored to the bottom while layout/history settles',
);
assert(
  /let\s+hasCompletedInitialSessionLoad\s*=\s*false/.test(appJs),
  'auth reconnects need to distinguish the first session load from later foreground reconnects',
);
assert(
  /pendingInitialSessionLoad\s*=\s*!hasCompletedInitialSessionLoad/.test(appJs),
  'token re-auth after mobile reconnect must not reload the current idle session as an initial load',
);
assert(
  /\.messages\s*\{[\s\S]*overflow-anchor:\s*none;/.test(styleCss),
  'messages scroller should disable browser scroll anchoring so history items cannot become the restore anchor',
);

console.log('mobile scroll regression checks passed');
