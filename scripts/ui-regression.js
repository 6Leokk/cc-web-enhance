#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { shouldTreatCompletionAsError } = require('../lib/completion-error');
const { readPublicCss } = require('./read-public-css');

const root = path.resolve(__dirname, '..');
const appJs = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
const serverJs = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const styleCss = readPublicCss(root);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(
  shouldTreatCompletionAsError(null, 'unknown (detected by monitor)', 'apply_patch verification failed', { hasResponseText: true }) === false,
  'pid monitor completion with response text should not turn tool stderr into task failure'
);
assert(
  shouldTreatCompletionAsError(1, null, 'apply_patch verification failed', { hasResponseText: true }) === true,
  'real non-zero exit should still be treated as task failure'
);
assert(
  shouldTreatCompletionAsError(null, 'unknown (detected by monitor)', 'spawn failed', { hasResponseText: false }) === true,
  'pid monitor completion without response text should still surface stderr as task failure'
);

assert(
  /--tool-call-command-bg:\s*#101010;/.test(styleCss) &&
    /\.tool-call-content\.command,[\s\S]*border-top:\s*var\(--tool-call-command-border-top\);/.test(styleCss),
  'mono-night command tool content styling should now come from semantic tokens'
);
assert(
  /--tool-call-code-bg:\s*#080808;/.test(styleCss) &&
    /\.tool-call-code\s*\{[\s\S]*background:\s*var\(--tool-call-code-bg\);[\s\S]*border:\s*var\(--tool-call-code-border\);/.test(styleCss),
  'mono-night tool code styling should now come from semantic tokens'
);

assert(
  appJs.includes("label: '分段显示（默认）'"),
  'assistant message mode segmented option should show it is the default'
);
assert(
  appJs.includes('系统默认是分段显示'),
  'assistant message mode help should explain the system default'
);

assert(
  /function\s+refreshCurrentSessionAfterMetadataChange\(previousMeta,\s*nextMeta\)/.test(appJs) &&
    /previousMeta\?\.isRunning\s*&&\s*!nextMeta\?\.isRunning/.test(appJs) &&
    /openSession\(currentSessionId,\s*\{\s*forceSync:\s*true,\s*blocking:\s*false/.test(appJs),
  'current session should reload messages when session metadata changes from running to completed'
);
assert(
  /case 'session_list':[\s\S]*previousCurrentMeta[\s\S]*refreshCurrentSessionAfterMetadataChange\(previousCurrentMeta,\s*currentSessionId \? getSessionMeta\(currentSessionId\) : null\)/.test(appJs),
  'session_list handling should compare previous and latest current-session metadata'
);
assert(
  /function\s+updateChatRuntimeStateBadge\(\)/.test(appJs) &&
    /chatRuntimeState\.textContent\s*=\s*running\s*\?\s*'运行中'\s*:\s*'已完成'/.test(appJs) &&
    /chatRuntimeState\.classList\.toggle\('is-running',\s*running\)/.test(appJs) &&
    /chatRuntimeState\.classList\.toggle\('is-complete',\s*!running\)/.test(appJs),
  'header runtime badge should switch between running and completed states'
);
assert(
  /chatTitle\.title\s*=\s*\[titleText,\s*currentCwd\]\.filter\(Boolean\)\.join\('\\n'\)/.test(appJs) &&
    /chatCwd\.hidden\s*=\s*true;/.test(appJs),
  'cwd should be retained outside the header status slot by moving it into the title tooltip'
);
assert(
  /\.chat-runtime-state\.is-running::before\s*\{[\s\S]*animation:\s*pulse 1\.1s infinite;/.test(styleCss) &&
    /\.chat-runtime-state\.is-complete::before\s*\{[\s\S]*animation:\s*none;/.test(styleCss),
  'header runtime badge indicator should animate only while running'
);
assert(
  /function\s+broadcastBackgroundDone\(sessionId,\s*entry,\s*excludeWs\s*=\s*null\)/.test(serverJs) &&
    /broadcastBackgroundDone\(sessionId,\s*entry,\s*entry\.ws\)/.test(serverJs),
  'process completion should notify other connected clients even when one websocket receives the final stream'
);
assert(
  /function\s+finishGenerating\(sessionId\)[\s\S]*currentSessionId\s*=\s*sessionId/.test(appJs) === false,
  'runtime completion should not mutate currentSessionId after navigation state changes',
);

console.log('ui regression checks passed');
