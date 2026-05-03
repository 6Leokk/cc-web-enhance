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

const visibilityStart = appJs.indexOf("document.addEventListener('visibilitychange'");
const visibilityEnd = appJs.indexOf("window.addEventListener('pagehide'", visibilityStart);
const visibilityHandler = visibilityStart >= 0 && visibilityEnd > visibilityStart
  ? [appJs.slice(visibilityStart, visibilityEnd)]
  : null;

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
    /openSession\(currentSessionId,\s*\{[\s\S]*forceSync:\s*true[\s\S]*blocking:\s*false/.test(visibilityHandler[0]) &&
    !/send\(\{\s*type:\s*'load_session',\s*sessionId:\s*currentSessionId\s*\}\)/.test(visibilityHandler[0]),
  'returning to the foreground should refresh active/running sessions through the shared owned-load contract',
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
  /function\s+shouldApplySessionInfo\(msg\)[\s\S]*return\s+!!msg\?\.requestId\s*&&\s*activeSessionLoad\.requestId\s*===\s*msg\.requestId/.test(appJs),
  'active session loads must reject no-requestId session_info responses',
);
assert(
  /function\s+shouldApplySessionHistoryChunk\(msg\)[\s\S]*msg\?\.requestId[\s\S]*activeSessionLoad\.requestId\s*===\s*msg\.requestId/.test(appJs) &&
    /case 'session_history_chunk':[\s\S]*shouldApplySessionHistoryChunk\(msg\)/.test(appJs),
  'session_history_chunk handling should accept only the active requestId when one is present',
);
assert(
  /function\s+shouldApplySessionHistoryChunk\(msg\)[\s\S]*return\s+!!msg\?\.requestId\s*&&\s*activeSessionLoad\.requestId\s*===\s*msg\.requestId/.test(appJs),
  'active session loads must reject no-requestId history chunk responses',
);
assert(
  /function\s+ensureHistoryViewportFilled\(\)[\s\S]*hasOlderHistory\(\)[\s\S]*messagesDiv\.scrollHeight[\s\S]*messagesDiv\.clientHeight[\s\S]*requestOlderHistory\(\)/.test(appJs),
  'lazy history loading should proactively fetch older chunks when the initial viewport has no scrollbar',
);
assert(
  /case 'session_info':[\s\S]*scheduleHistoryViewportFill\(\)/.test(appJs) &&
    /case 'session_history_chunk':[\s\S]*scheduleHistoryViewportFill\(\)/.test(appJs),
  'lazy history viewport filling should run after both initial session loads and older-history chunk prepends',
);
assert(
  /ws\.onclose\s*=\s*\(\)\s*=>\s*\{[\s\S]*clearHistoryLoad\(\)/.test(appJs),
  'websocket disconnects should clear any in-flight history load state',
);
assert(
  /function\s+send\(data\)\s*\{[\s\S]*return\s+false;[\s\S]*return\s+true;/.test(appJs) &&
    /if\s*\(!send\(\{[\s\S]*type:\s*'load_session_history_chunk'[\s\S]*\}\)\)\s*\{[\s\S]*clearHistoryLoad\(currentSessionId\)/.test(appJs),
  'history fetch requests should unwind activeHistoryLoad when the websocket is unavailable',
);
assert(
  /function\s+beginSessionSwitch\(sessionId,\s*options\s*=\s*\{}\)[\s\S]*setSessionLoading\(sessionId[\s\S]*if\s*\(!send\(\{\s*type:\s*'load_session',\s*sessionId,\s*requestId\s*\}\)\)\s*\{[\s\S]*clearSessionLoading\(sessionId\)[\s\S]*return;[\s\S]*loadedHistorySessionId\s*=\s*null;/.test(appJs),
  'session switches should unwind activeSessionLoad without dropping current lazy-history ownership when load_session cannot be sent',
);
assert(
  /case 'session_list':[\s\S]*scheduleHistoryViewportFill\(\)/.test(appJs),
  'session list refreshes should retry underfilled lazy history after reconnects',
);
assert(
  /function\s+matchesActiveLoadError\(activeLoad,\s*msg\)/.test(appJs) &&
    /case 'error':[\s\S]*matchesActiveLoadError\(activeSessionLoad,\s*msg\)/.test(appJs) &&
    /case 'error':[\s\S]*matchesActiveLoadError\(activeHistoryLoad,\s*msg\)/.test(appJs),
  'scoped load errors should clear only the matching active session or history request',
);
assert(
  /function\s+handleLoadSession\(ws,\s*sessionId,\s*requestId[\s\S]*type:\s*'error'[\s\S]*requestId[\s\S]*sessionId[\s\S]*Session not found/.test(serverJs) &&
    /function\s+handleLoadSessionHistoryChunk\(ws,\s*msg\)[\s\S]*type:\s*'error'[\s\S]*requestId[\s\S]*sessionId[\s\S]*Session not found/.test(serverJs),
  'load_session and lazy-history protocol errors should be scoped with requestId and sessionId',
);
assert(
  !/currentHistoryComplete\s*=\s*currentHistoryComplete\s*\|\|\s*nextHistoryComplete/.test(appJs),
  'preserveStreaming history refresh must not mask newly-available older history',
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
  /function\s+setSessionLoading\(sessionId,\s*options\s*=\s*\{}\)[\s\S]*anchorToBottom/.test(appJs),
  'session loading state should preserve whether this load must end at the latest message',
);
assert(
  /function\s+shouldAnchorBottomAfterSessionLoad\(sessionId\)/.test(appJs) &&
    /function\s+finishSessionSwitch\(sessionId\)[\s\S]*shouldAnchorBottomAfterSessionLoad\(sessionId\)[\s\S]*forceMessagesBottomAfterSessionSwitch\(\)/.test(appJs),
  'session switch completion should anchor by explicit navigation intent, not only by blocking overlays',
);
assert(
  /function\s+openSession\(sessionId,\s*options\s*=\s*\{}\)[\s\S]*sessionId\s*!==\s*currentSessionId/.test(appJs) &&
    /disposition\s*===\s*'weak'[\s\S]*beginSessionSwitch\(sessionId,\s*\{[\s\S]*anchorToBottom/.test(appJs),
  'weak-cache session switches must preserve cross-session bottom anchoring through the background sync load',
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
