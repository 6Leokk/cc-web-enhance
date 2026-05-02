#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const {
  buildAssistantCompletionMessages,
  normalizeAssistantMessageMode,
} = require('../lib/assistant-message-mode');

const root = path.resolve(__dirname, '..');
const appJs = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
const serverJs = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const agentRuntimeJs = fs.readFileSync(path.join(root, 'lib', 'agent-runtime.js'), 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(normalizeAssistantMessageMode('segmented') === 'segmented', 'segmented should be accepted');
assert(normalizeAssistantMessageMode('single') === 'single', 'single should be accepted');
assert(normalizeAssistantMessageMode('unknown') === 'segmented', 'unknown mode should default to segmented');

const runtimeEntry = {
  fullText: 'First\n\nSecond',
  toolCalls: [
    { id: 'a', name: 'ToolA', done: true },
    { id: 'b', name: 'ToolB', done: true },
  ],
  assistantSegments: [
    { content: 'First', toolCalls: [{ id: 'a', name: 'ToolA', done: true }] },
    { content: 'Second', toolCalls: [{ id: 'b', name: 'ToolB', done: true }] },
  ],
};

const segmented = buildAssistantCompletionMessages(runtimeEntry, 'segmented', '2026-05-02T00:00:00.000Z');
assert(segmented.length === 2, `segmented should save new completion as two assistant messages, got ${segmented.length}`);
assert(segmented[0].content === 'First' && segmented[1].content === 'Second', 'segmented should preserve segment text');
assert(segmented[0].toolCalls.length === 1 && segmented[1].toolCalls.length === 1, 'segmented should keep tools with each new segment');

const single = buildAssistantCompletionMessages(runtimeEntry, 'single', '2026-05-02T00:00:00.000Z');
assert(single.length === 1, `single should save new completion as one assistant message, got ${single.length}`);
assert(single[0].content === 'First\n\nSecond', `single should use the combined completion text, got ${JSON.stringify(single[0].content)}`);
assert(single[0].toolCalls.length === 2, `single should collect all tools on the one assistant message, got ${single[0].toolCalls.length}`);

const toolOnlyFallback = buildAssistantCompletionMessages({
  fullText: 'Only text',
  toolCalls: [{ id: 'a', name: 'ToolA', done: true }],
  assistantSegments: [
    { content: '', toolCalls: [{ id: 'a', name: 'ToolA', done: true }] },
    { content: 'Only text', toolCalls: [] },
  ],
}, 'segmented', '2026-05-02T00:00:00.000Z');
assert(toolOnlyFallback.length === 2, 'segmented should preserve explicit tool-only segments when runtime emits them');

assert(serverJs.includes('UI_CONFIG_PATH'), 'server UI config path is missing');
assert(serverJs.includes('buildAssistantCompletionMessages'), 'server should build final new assistant messages using the selected mode');
assert(serverJs.includes('assistant_messages_final'), 'server should send final assistant messages after completion');
assert(/type:\s*'resume_generating'[\s\S]*assistantSegments:\s*entry\.assistantSegments/.test(serverJs), 'resume_generating should include active assistant segments');
assert(agentRuntimeJs.includes('assistant_segment_start'), 'runtime should stream assistant segment boundaries before completion');
assert(!serverJs.includes('projectAssistantMessages(session.messages'), 'server should not re-project already saved history on load');
assert(appJs.includes('assistant-message-mode-select'), 'settings UI select for assistant message mode is missing');
assert(appJs.includes('assistant-message-mode-help'), 'settings UI help button for assistant message mode is missing');
assert(appJs.includes('assistant_message_mode_help'), 'settings UI help message is missing');
assert(appJs.includes("case 'assistant_segment_start'"), 'frontend should handle streamed assistant segment boundaries');
assert(appJs.includes('renderResumedAssistantSegments(msg)'), 'frontend should rebuild segmented streaming messages on resume');
assert(/function normalizeResumedAssistantSegments\(msg\)[\s\S]*assistantMessageMode === 'single'/.test(appJs), 'resume rendering should honor single assistant message mode');
assert(appJs.includes('looseBefore.length + 1 >= FOLD_AT'), 'streaming tools should fold as soon as the third tool is added');
assert(appJs.includes('loose.length + 1 >= FOLD_AT'), 'saved tools should fold as soon as the third tool is added');

console.log('assistant message mode regression checks passed');
