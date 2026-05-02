#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { shouldTreatCompletionAsError } = require('../lib/completion-error');
const { readPublicCss } = require('./read-public-css');

const root = path.resolve(__dirname, '..');
const appJs = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
const serverJs = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const runtimeJs = fs.readFileSync(path.join(root, 'lib', 'agent-runtime.js'), 'utf8');
const styleCss = readPublicCss(root);
const indexHtml = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');

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
  /\.input-wrapper\s*\{[\s\S]*align-items:\s*flex-end;/.test(styleCss) &&
    /\.attach-btn\s*\{[\s\S]*width:\s*40px;[\s\S]*height:\s*40px;/.test(styleCss) &&
    /#msg-input\s*\{[\s\S]*align-self:\s*center;/.test(styleCss),
  'composer should keep the upload button fixed while centering the text input beside it'
);
assert(
  /id="composer-statusline"/.test(fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8')) &&
    /\.composer-statusline\s*\{/.test(styleCss) &&
    /function\s+renderComposerStatusline\(\)/.test(appJs) &&
    /currentModel/.test(appJs) &&
    /currentCwd/.test(appJs) &&
    /workspaceStatus/.test(appJs),
  'composer should expose a dedicated status line under the input with model cwd context and git data'
);
assert(
  /workspaceStatus:\s*payload\.workspaceStatus\s*\?\s*deepClone\(payload\.workspaceStatus\)\s*:\s*null/.test(appJs) &&
    /workspaceStatus:\s*buildWorkspaceStatus\(session\)/.test(serverJs) &&
    /type:\s*'workspace_status'/.test(serverJs),
  'session payloads and runtime updates should carry workspace status metadata'
);
assert(
  /function\s+resolveContextWindowTokens/.test(appJs) &&
    /function\s+formatCurrentContextUsageText/.test(appJs) &&
    /function\s+formatTotalUsageText/.test(appJs) &&
    /function\s+formatWorkspaceGitText/.test(appJs),
  'composer status line should format current context total usage and git status explicitly'
);
assert(
  /cwdDisplay/.test(serverJs) &&
    /currentWorkspaceStatus\?\.cwdDisplay/.test(appJs) &&
    /~\//.test(appJs),
  'composer status line should preserve a visible tilde in home-directory paths'
);
assert(
  /lastUsage:\s*payload\.lastUsage\s*\?\s*deepClone\(payload\.lastUsage\)\s*:\s*null/.test(appJs) &&
    /lastUsage:\s*session\.lastUsage\s*\|\|\s*null/.test(serverJs) &&
    /type:\s*'usage'[\s\S]*lastUsage/.test(runtimeJs),
  'runtime usage updates should distinguish current-context usage from cumulative totals'
);
const currentContextFormatter = appJs.match(/function\s+formatCurrentContextUsageText\(\)\s*\{([\s\S]*?)\n\s*\}/);
assert(currentContextFormatter, 'current context usage formatter should exist');
assert(
  /currentLastUsage\.inputTokens/.test(currentContextFormatter[1]) &&
    !/cachedInputTokens/.test(currentContextFormatter[1]),
  'current context usage should use lastUsage.inputTokens only; cachedInputTokens is a subset, not an extra context count'
);
const totalUsageFormatter = appJs.match(/function\s+formatTotalUsageText\(\)\s*\{([\s\S]*?)\n\s*\}/);
assert(totalUsageFormatter, 'total usage formatter should exist');
assert(
  /currentTotalUsage\.inputTokens/.test(totalUsageFormatter[1]) &&
    /currentTotalUsage\.outputTokens/.test(totalUsageFormatter[1]) &&
    !/cachedInputTokens/.test(totalUsageFormatter[1]),
  'total usage should sum inputTokens and outputTokens only; cachedInputTokens is displayed as detail elsewhere and must not be double-counted'
);
assert(
  /composer-status-segment is-model/.test(appJs) &&
    /formatModelDisplay\(currentModel,\s*currentReasoningEffort\)/.test(appJs),
  'composer status line should render the full current model string as the leading segment'
);
assert(
  /reasoningEffort:\s*payload\.reasoningEffort\s*\|\|\s*''/.test(appJs) &&
    /reasoningEffort:\s*sessionReasoningEffort\(session\)/.test(serverJs) &&
    /type:\s*'model_changed'[\s\S]*reasoningEffort/.test(serverJs) &&
    /function\s+formatModelDisplay\(/.test(appJs),
  'structured reasoningEffort should flow from the server into a dedicated UI model formatter'
);
assert(
  !/cdnjs\.cloudflare\.com/.test(indexHtml) &&
    !/cdn\.jsdelivr\.net/.test(indexHtml) &&
    /vendor\/marked\.min\.js/.test(indexHtml) &&
    /vendor\/highlight\.min\.js/.test(indexHtml) &&
    /vendor\/highlight-atom-one-dark\.min\.css/.test(indexHtml) &&
    /vendor\/purify\.min\.js/.test(indexHtml),
  'critical browser dependencies should be served from local vendor assets instead of public CDNs'
);
assert(
  /if-none-match/i.test(serverJs) &&
    /ETag/.test(serverJs) &&
    /max-age=31536000|must-revalidate/.test(serverJs) &&
    /index\.html/.test(serverJs),
  'static asset delivery should distinguish shell caching from local asset validation'
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
