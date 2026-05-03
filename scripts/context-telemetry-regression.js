#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { createAgentRuntime } = require('../lib/agent-runtime');
const { parseClaudeTranscriptLines } = require('../lib/claude-transcript');
const { applyCodexParsedTelemetryToSession } = require('../lib/codex-telemetry');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const sessions = new Map();
sessions.set('session-codex', {
  id: 'session-codex',
  agent: 'codex',
  totalUsage: { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 },
  lastUsage: null,
  contextWindowTokens: null,
});

const sent = [];
let saveCount = 0;
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
  loadSession: (sessionId) => sessions.get(sessionId) || null,
  saveSession: (session) => {
    saveCount += 1;
    sessions.set(session.id, JSON.parse(JSON.stringify(session)));
  },
  setRuntimeSessionId: () => {},
  getRuntimeSessionId: () => '',
});

const codexEntry = {
  agent: 'codex',
  fullText: '',
  toolCalls: [],
  assistantSegments: [],
  ws: {},
  lastUsage: null,
};

runtime.processCodexRolloutEntry(codexEntry, {
  type: 'event_msg',
  payload: {
    type: 'task_started',
    model_context_window: 258400,
  },
}, 'session-codex');

runtime.processCodexRolloutEntry(codexEntry, {
  type: 'event_msg',
  payload: {
    type: 'token_count',
    info: {
      total_token_usage: {
        input_tokens: 25474,
        cached_input_tokens: 20736,
        output_tokens: 1034,
      },
      last_token_usage: {
        input_tokens: 13707,
        cached_input_tokens: 11648,
        output_tokens: 349,
      },
      model_context_window: 258400,
    },
  },
}, 'session-codex');

assert(codexEntry.lastUsage && codexEntry.lastUsage.source === 'context', 'Codex rollout telemetry should set a context-scoped lastUsage snapshot');
assert(codexEntry.lastUsage.inputTokens === 13707, `Expected Codex current context usage to come from last_token_usage.input_tokens, got ${JSON.stringify(codexEntry.lastUsage)}`);
assert(codexEntry.lastUsage.contextWindowTokens === 258400, `Expected Codex lastUsage to include rollout model_context_window, got ${JSON.stringify(codexEntry.lastUsage)}`);

const codexSession = sessions.get('session-codex');
assert(codexSession.contextWindowTokens === 258400, `Expected Codex session to persist rollout context window, got ${JSON.stringify(codexSession)}`);
assert(codexSession.totalUsage.inputTokens === 25474, `Expected Codex total usage to persist rollout total_token_usage, got ${JSON.stringify(codexSession.totalUsage)}`);
assert(codexSession.lastUsage && codexSession.lastUsage.inputTokens === 13707, `Expected Codex session to persist rollout current-usage snapshot, got ${JSON.stringify(codexSession.lastUsage)}`);

runtime.processCodexRolloutEntry(codexEntry, {
  type: 'turn_context',
  payload: {
    model: 'gpt-5.5',
    effort: 'high',
  },
}, 'session-codex');

const codexModelSession = sessions.get('session-codex');
assert(codexModelSession.model === 'gpt-5.5', `Expected Codex turn_context to persist model, got ${JSON.stringify(codexModelSession)}`);
assert(codexModelSession.reasoningEffort === 'high', `Expected Codex turn_context to persist reasoning effort, got ${JSON.stringify(codexModelSession)}`);
assert(
  sent.some((msg) => msg.type === 'model_changed' && msg.sessionId === 'session-codex' && msg.model === 'gpt-5.5' && msg.reasoningEffort === 'high'),
  `Expected Codex turn_context metadata to stream scoped model_changed, got ${JSON.stringify(sent)}`,
);

runtime.processCodexEvent(codexEntry, {
  type: 'turn.completed',
  usage: {
    input_tokens: 10,
    cached_input_tokens: 2,
    output_tokens: 5,
  },
}, 'session-codex');

assert(codexEntry.lastUsage && codexEntry.lastUsage.source === 'context', `turn.completed fallback should not clobber rollout-derived context usage, got ${JSON.stringify(codexEntry.lastUsage)}`);

const repeatedTelemetrySession = {
  id: 'session-repeat',
  agent: 'codex',
  totalUsage: { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 },
  lastUsage: null,
  contextWindowTokens: null,
};
sessions.set(repeatedTelemetrySession.id, JSON.parse(JSON.stringify(repeatedTelemetrySession)));
const repeatEntry = {
  agent: 'codex',
  fullText: '',
  toolCalls: [],
  assistantSegments: [],
  ws: {},
  lastUsage: null,
};
const repeatedTokenEvent = {
  type: 'event_msg',
  payload: {
    type: 'token_count',
    info: {
      total_token_usage: {
        input_tokens: 77,
        cached_input_tokens: 12,
        output_tokens: 9,
      },
      last_token_usage: {
        input_tokens: 33,
        cached_input_tokens: 6,
        output_tokens: 4,
      },
      model_context_window: 258400,
    },
  },
};

const saveCountBeforeRepeat = saveCount;
const sentCountBeforeRepeat = sent.length;
runtime.processCodexRolloutEntry(repeatEntry, repeatedTokenEvent, repeatedTelemetrySession.id);
const saveCountAfterFirstRepeat = saveCount;
const sentCountAfterFirstRepeat = sent.length;
assert(saveCountAfterFirstRepeat === saveCountBeforeRepeat + 1, `Expected first repeated token_count to persist once, got saveCount=${saveCount}`);
assert(sentCountAfterFirstRepeat === sentCountBeforeRepeat + 1, `Expected first repeated token_count to stream one usage update, got sent=${JSON.stringify(sent.slice(sentCountBeforeRepeat))}`);
runtime.processCodexRolloutEntry(repeatEntry, repeatedTokenEvent, repeatedTelemetrySession.id);
assert(saveCount === saveCountAfterFirstRepeat, `Expected unchanged repeated token_count to skip saveSession, got saveCount=${saveCount} after ${saveCountAfterFirstRepeat}`);
assert(sent.length === sentCountAfterFirstRepeat, `Expected unchanged repeated token_count to skip duplicate usage push, got sent=${JSON.stringify(sent.slice(sentCountBeforeRepeat))}`);

const freshSent = [];
const freshSessions = new Map();
freshSessions.set('session-fresh', {
  id: 'session-fresh',
  agent: 'codex',
  totalUsage: { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 },
  lastUsage: null,
  contextWindowTokens: null,
});
const freshRuntime = createAgentRuntime({
  processEnv: {},
  CLAUDE_PATH: 'claude',
  CODEX_PATH: 'codex',
  MODEL_MAP: {},
  loadModelConfig: () => ({}),
  applyCustomTemplateToSettings: () => {},
  loadCodexConfig: () => ({}),
  prepareCodexCustomRuntime: () => ({}),
  wsSend: (_ws, msg) => freshSent.push(msg),
  truncateObj: (value) => value,
  sanitizeToolInput: (_name, value) => value,
  loadSession: (sessionId) => freshSessions.get(sessionId) || null,
  saveSession: (session) => freshSessions.set(session.id, JSON.parse(JSON.stringify(session))),
  setRuntimeSessionId: () => {},
  getRuntimeSessionId: () => '',
});
const freshEntry = {
  agent: 'codex',
  fullText: '',
  toolCalls: [],
  assistantSegments: [],
  ws: {},
  lastUsage: null,
};

freshRuntime.processCodexEvent(freshEntry, {
  type: 'turn.completed',
  usage: {
    input_tokens: 88,
    cached_input_tokens: 21,
    output_tokens: 13,
  },
}, 'session-fresh');

assert(freshEntry.lastUsage === null, `turn.completed without rollout context should not synthesize a fake context snapshot, got ${JSON.stringify(freshEntry.lastUsage)}`);
assert(
  freshSent.some((msg) =>
    msg.type === 'usage' &&
    msg.totalUsage &&
    msg.totalUsage.inputTokens === 88 &&
    msg.lastUsage == null
  ),
  `turn.completed without rollout context should stream totals only, got ${JSON.stringify(freshSent)}`,
);

const usageMessages = sent.filter((msg) => msg.type === 'usage');
assert(usageMessages.length >= 2, `Expected usage messages from rollout telemetry and turn completion, got ${JSON.stringify(sent)}`);
assert(
  usageMessages.some((msg) => msg.lastUsage && msg.lastUsage.source === 'context' && msg.contextWindowTokens === 258400),
  `Expected streamed usage payload to include context-scoped lastUsage and contextWindowTokens, got ${JSON.stringify(usageMessages)}`,
);

const liveCodexSession = {
  id: 'session-live',
  agent: 'codex',
  model: 'gpt-5.4',
  reasoningEffort: 'high',
  totalUsage: { inputTokens: 300, cachedInputTokens: 200, outputTokens: 40 },
  lastUsage: {
    inputTokens: 120,
    cachedInputTokens: 80,
    outputTokens: 7,
    source: 'context',
    contextWindowTokens: 258400,
  },
  contextWindowTokens: 258400,
  importedRolloutPath: '/tmp/runtime-rollout.jsonl',
};

applyCodexParsedTelemetryToSession(liveCodexSession, {
  meta: { model: 'gpt-5.4', reasoningEffort: 'xhigh' },
  totalUsage: { inputTokens: 240, cachedInputTokens: 120, outputTokens: 31 },
  lastUsage: {
    inputTokens: 44,
    cachedInputTokens: 11,
    outputTokens: 3,
    source: 'context',
    contextWindowTokens: 128000,
  },
  contextWindowTokens: 128000,
}, '/tmp/stale-imported-rollout.jsonl');

assert(liveCodexSession.reasoningEffort === 'xhigh', `Expected metadata refresh to still update reasoning effort, got ${JSON.stringify(liveCodexSession)}`);
assert(liveCodexSession.totalUsage.inputTokens === 300, `Expected stale parsed totals not to roll back live inputTokens, got ${JSON.stringify(liveCodexSession.totalUsage)}`);
assert(liveCodexSession.totalUsage.cachedInputTokens === 200, `Expected stale parsed totals not to roll back live cachedInputTokens, got ${JSON.stringify(liveCodexSession.totalUsage)}`);
assert(liveCodexSession.totalUsage.outputTokens === 40, `Expected stale parsed totals not to roll back live outputTokens, got ${JSON.stringify(liveCodexSession.totalUsage)}`);
assert(liveCodexSession.lastUsage && liveCodexSession.lastUsage.inputTokens === 120, `Expected stale parsed lastUsage not to clobber newer live context snapshot, got ${JSON.stringify(liveCodexSession.lastUsage)}`);
assert(liveCodexSession.contextWindowTokens === 258400, `Expected stale parsed context window not to clobber newer live context window, got ${JSON.stringify(liveCodexSession)}`);
assert(liveCodexSession.importedRolloutPath === '/tmp/runtime-rollout.jsonl', `Expected stale rollout path not to replace the live rollout path, got ${JSON.stringify(liveCodexSession)}`);

const staleCodexSession = {
  id: 'session-stale',
  agent: 'codex',
  model: 'gpt-5.4',
  reasoningEffort: '',
  totalUsage: { inputTokens: 12695478, cachedInputTokens: 12257920, outputTokens: 51807 },
  lastUsage: null,
  contextWindowTokens: null,
};

applyCodexParsedTelemetryToSession(staleCodexSession, {
  meta: { model: 'gpt-5.4', reasoningEffort: 'xhigh' },
  totalUsage: { inputTokens: 12892427, cachedInputTokens: 12379136, outputTokens: 52701 },
  lastUsage: {
    inputTokens: 196949,
    cachedInputTokens: 121216,
    outputTokens: 894,
    source: 'context',
    contextWindowTokens: 258400,
  },
  contextWindowTokens: 258400,
}, '/tmp/rollout.jsonl');

assert(staleCodexSession.reasoningEffort === 'xhigh', `Expected stale Codex session reasoning effort to refresh from rollout metadata, got ${JSON.stringify(staleCodexSession)}`);
assert(staleCodexSession.totalUsage.inputTokens === 12892427, `Expected stale Codex total usage to refresh from rollout totals, got ${JSON.stringify(staleCodexSession.totalUsage)}`);
assert(staleCodexSession.lastUsage && staleCodexSession.lastUsage.inputTokens === 196949, `Expected stale Codex current usage to refresh from rollout last usage, got ${JSON.stringify(staleCodexSession.lastUsage)}`);
assert(staleCodexSession.contextWindowTokens === 258400, `Expected stale Codex context window to refresh from rollout telemetry, got ${JSON.stringify(staleCodexSession)}`);
assert(staleCodexSession.importedRolloutPath === '/tmp/rollout.jsonl', `Expected stale Codex session to remember rollout path, got ${JSON.stringify(staleCodexSession)}`);

const serverJs = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
const resolveMatch = serverJs.match(/function resolveCodexRolloutPathForSession\(session\) \{[\s\S]*?\n\}/);
assert(resolveMatch, 'resolveCodexRolloutPathForSession implementation is missing');
const resolveBody = resolveMatch[0];
const localHomeIdx = resolveBody.indexOf('if (session.codexHomeDir)');
const requestedRolloutIdx = resolveBody.indexOf('const requestedPath');
const requestedRolloutReturnIdx = resolveBody.indexOf('if (requestedPath && fs.existsSync(requestedPath)) return');
assert(localHomeIdx >= 0, 'resolveCodexRolloutPathForSession should consult codexHomeDir');
assert(requestedRolloutIdx >= 0 && requestedRolloutReturnIdx >= 0, 'resolveCodexRolloutPathForSession should handle imported rollout paths');
assert(
  localHomeIdx < requestedRolloutReturnIdx,
  'resolveCodexRolloutPathForSession should prefer the live codexHomeDir rollout before any imported rollout path',
);

const parsedClaude = parseClaudeTranscriptLines([
  JSON.stringify({
    type: 'user',
    timestamp: '2026-05-03T00:00:00.000Z',
    cwd: '/tmp/project-a',
    message: { content: 'Need usage recovery' },
  }),
  JSON.stringify({
    type: 'assistant',
    timestamp: '2026-05-03T00:00:02.000Z',
    isSidechain: false,
    message: {
      content: [{ type: 'text', text: 'First answer' }],
      usage: {
        input_tokens: 1200,
        cache_creation_input_tokens: 100,
        cache_read_input_tokens: 200,
        output_tokens: 30,
      },
    },
  }),
  JSON.stringify({
    type: 'assistant',
    timestamp: '2026-05-03T00:00:03.000Z',
    isSidechain: true,
    message: {
      content: [{ type: 'text', text: 'Sidechain answer' }],
      usage: {
        input_tokens: 9999,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
        output_tokens: 1,
      },
    },
  }),
  JSON.stringify({
    type: 'assistant',
    timestamp: '2026-05-03T00:00:04.000Z',
    isSidechain: false,
    message: {
      content: [{ type: 'text', text: 'Second answer' }],
      usage: {
        input_tokens: 1500,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 300,
        output_tokens: 45,
      },
    },
  }),
  JSON.stringify({
    type: 'assistant',
    timestamp: '2026-05-03T00:00:05.000Z',
    isSidechain: false,
    isApiErrorMessage: true,
    message: {
      content: [{ type: 'text', text: 'Synthetic error' }],
      usage: {
        input_tokens: 1,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
        output_tokens: 0,
      },
    },
  }),
]);

assert(parsedClaude.meta.title === 'Need usage recovery', `Expected Claude transcript title recovery, got ${JSON.stringify(parsedClaude.meta)}`);
assert(parsedClaude.meta.cwd === '/tmp/project-a', `Expected Claude transcript cwd recovery, got ${JSON.stringify(parsedClaude.meta)}`);
assert(parsedClaude.messages.length === 5, `Expected Claude transcript message parsing to preserve existing visible transcript messages while adding usage recovery, got ${JSON.stringify(parsedClaude.messages)}`);
assert(parsedClaude.totalUsage.inputTokens === 12700, `Expected Claude total input tokens to sum all assistant usage entries, got ${JSON.stringify(parsedClaude.totalUsage)}`);
assert(parsedClaude.totalUsage.cachedInputTokens === 600, `Expected Claude cached token total to include both cache creation and cache read, got ${JSON.stringify(parsedClaude.totalUsage)}`);
assert(parsedClaude.totalUsage.outputTokens === 76, `Expected Claude output token total to sum all assistant usage entries, got ${JSON.stringify(parsedClaude.totalUsage)}`);
assert(parsedClaude.lastUsage && parsedClaude.lastUsage.source === 'context', `Expected Claude import to recover current-context usage snapshot, got ${JSON.stringify(parsedClaude.lastUsage)}`);
assert(parsedClaude.lastUsage.inputTokens === 1800, `Expected Claude current context usage to include cached prompt tokens, got ${JSON.stringify(parsedClaude.lastUsage)}`);
assert(parsedClaude.lastUsage.cachedInputTokens === 300, `Expected Claude current snapshot to preserve cached input tokens, got ${JSON.stringify(parsedClaude.lastUsage)}`);

console.log('context telemetry regression passed');
