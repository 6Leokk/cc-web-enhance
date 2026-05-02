#!/usr/bin/env node

const { createAgentRuntime } = require('../lib/agent-runtime');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const sent = [];
const runtime = createAgentRuntime({
  processEnv: {},
  CLAUDE_PATH: 'claude',
  CODEX_PATH: 'codex',
  MODEL_MAP: {},
  loadModelConfig: () => ({}),
  applyCustomTemplateToSettings: () => {},
  loadCodexConfig: () => ({}),
  prepareCodexCustomRuntime: () => ({}),
  wsSend: (_ws, msg) => sent.push(msg),
  truncateObj: (value) => value,
  sanitizeToolInput: (_name, value) => value,
  loadSession: () => null,
  saveSession: () => {},
  setRuntimeSessionId: () => {},
  getRuntimeSessionId: () => '',
});

const entry = {
  agent: 'codex',
  fullText: '',
  toolCalls: [],
  ws: {},
};

runtime.processCodexEvent(entry, {
  type: 'item.completed',
  item: { id: 'msg-1', type: 'agent_message', text: 'First paragraph.' },
}, 'session-a');

runtime.processCodexEvent(entry, {
  type: 'item.completed',
  item: { id: 'msg-2', type: 'agent_message', text: 'Second paragraph.' },
}, 'session-a');

assert(
  entry.fullText === 'First paragraph.\n\nSecond paragraph.',
  `Expected Codex agent messages to be separated by a blank line, got: ${JSON.stringify(entry.fullText)}`,
);

const textDeltas = sent.filter((msg) => msg.type === 'text_delta').map((msg) => msg.text);
assert(
  textDeltas.join('') === 'First paragraph.Second paragraph.',
  `Expected streamed text deltas to carry raw segment text, got: ${JSON.stringify(textDeltas)}`,
);
assert(
  entry.assistantSegments.length === 2,
  `Expected separate Codex agent_message events to become separate assistant segments, got ${entry.assistantSegments.length}`,
);

const segmentStarts = sent.filter((msg) => msg.type === 'assistant_segment_start');
assert(
  segmentStarts.length === 1 && segmentStarts[0].prefix === '\n\n',
  `Expected streamed segment boundary to carry the separator, got: ${JSON.stringify(segmentStarts)}`,
);

sent.length = 0;
const paragraphEntry = {
  agent: 'codex',
  fullText: '',
  toolCalls: [],
  assistantSegments: [],
  ws: {},
};

runtime.processCodexEvent(paragraphEntry, {
  type: 'item.completed',
  item: { id: 'msg-3', type: 'agent_message', text: 'First paragraph.\n\nSecond paragraph.\n\nThird paragraph.' },
}, 'session-a');

assert(
  paragraphEntry.fullText === 'First paragraph.\n\nSecond paragraph.\n\nThird paragraph.',
  `Expected full text to preserve blank-line paragraph separators, got: ${JSON.stringify(paragraphEntry.fullText)}`,
);
assert(
  paragraphEntry.assistantSegments.length === 1,
  `Expected one Codex agent_message with blank-line paragraphs to stay one assistant segment, got ${paragraphEntry.assistantSegments.length}`,
);
assert(
  paragraphEntry.assistantSegments[0].content === 'First paragraph.\n\nSecond paragraph.\n\nThird paragraph.',
  `Expected paragraph segment content to preserve separators, got: ${JSON.stringify(paragraphEntry.assistantSegments)}`,
);

const paragraphDeltas = sent.filter((msg) => msg.type === 'text_delta').map((msg) => msg.text);
assert(
  paragraphDeltas.join('') === 'First paragraph.\n\nSecond paragraph.\n\nThird paragraph.',
  `Expected paragraph text delta to preserve raw markdown spacing, got: ${JSON.stringify(paragraphDeltas)}`,
);

const paragraphStarts = sent.filter((msg) => msg.type === 'assistant_segment_start');
assert(
  paragraphStarts.length === 0,
  `Expected no streamed segment boundaries inside one markdown agent_message, got: ${JSON.stringify(paragraphStarts)}`,
);

sent.length = 0;
const codeBlockEntry = {
  agent: 'codex',
  fullText: '',
  toolCalls: [],
  assistantSegments: [],
  ws: {},
};
const codeBlockText = [
  'Intro paragraph.',
  '',
  '```js',
  'const a = 1;',
  '',
  'const b = 2;',
  '```',
  '',
  'Outro paragraph.',
].join('\n');

runtime.processCodexEvent(codeBlockEntry, {
  type: 'item.completed',
  item: { id: 'msg-4', type: 'agent_message', text: codeBlockText },
}, 'session-a');

assert(
  codeBlockEntry.assistantSegments.length === 1,
  `Expected fenced code and surrounding markdown to stay in one assistant segment, got ${codeBlockEntry.assistantSegments.length}`,
);
assert(
  codeBlockEntry.assistantSegments[0].content === codeBlockText,
  `Expected fenced code message to preserve all markdown spacing, got: ${JSON.stringify(codeBlockEntry.assistantSegments[0].content)}`,
);

console.log('codex message formatting regression passed');
