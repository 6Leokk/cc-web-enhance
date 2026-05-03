#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const appJs = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
const serverJs = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
const runtimeJs = fs.readFileSync(path.join(root, 'lib', 'agent-runtime.js'), 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(
  /function\s+resetChatView\(agent\)[\s\S]*currentSessionId\s*=\s*null/.test(appJs),
  'resetChatView should clear the current session selection before any later runtime events arrive',
);

assert(
  /function\s+handleDeleteSession\(ws,\s*sessionId\)[\s\S]*wsSend\(entry\.ws,\s*\{\s*type:\s*'done',\s*sessionId\s*}\)/.test(serverJs),
  'delete_session still emits a done event for running sessions and must not be allowed to reselect them on the client',
);

assert(
  /function\s+finishGenerating\(sessionId\)[\s\S]*currentSessionId\s*=\s*sessionId/.test(appJs) === false,
  'finishGenerating must not mutate currentSessionId from runtime completion events',
);
assert(
  /type:\s*'assistant_segment_start'[\s\S]*sessionId/.test(runtimeJs) &&
    /type:\s*'text_delta'[\s\S]*sessionId/.test(runtimeJs) &&
    /type:\s*'tool_start'[\s\S]*sessionId/.test(runtimeJs) &&
    /type:\s*'tool_end'[\s\S]*sessionId/.test(runtimeJs) &&
    /type:\s*'cost'[\s\S]*sessionId/.test(runtimeJs) &&
    /type:\s*'usage'[\s\S]*sessionId/.test(runtimeJs),
  'runtime streaming events should include sessionId so cached session switches can reject stale updates',
);
assert(
  /type:\s*'system_message'[\s\S]*sessionId/.test(serverJs) &&
    /type:\s*'error'[\s\S]*sessionId/.test(serverJs),
  'server completion and runtime error messages should include sessionId when they belong to a specific session',
);
assert(
  /function\s+sendSessionSystemMessage\(ws,\s*sessionId,\s*message\)/.test(serverJs) &&
    /function\s+sendSessionError\(ws,\s*sessionId,\s*message\)/.test(serverJs) &&
    /case '\/compact':[\s\S]*sendSessionSystemMessage\(ws,\s*sessionId,\s*compactStartMessage\(agent\)\)/.test(serverJs) &&
    /case '\/init':[\s\S]*sendSessionSystemMessage\(ws,\s*sessionId,\s*initStartMessage\(agent\)\)/.test(serverJs) &&
    /if\s*\(spawnSpec\?\.error\)\s*\{[\s\S]*sendSessionError\(ws,\s*currentSessionId,\s*spawnSpec\.error\)/.test(serverJs),
  'session-scoped command and spawn feedback should use the shared scoped message helpers',
);
assert(
  /case '\/model':[\s\S]*withOptionalSessionId\(sessionId,\s*\{\s*type:\s*'model_changed'/.test(serverJs) &&
    /function\s+handleSetMode\(ws,\s*sessionId,\s*mode\)[\s\S]*withOptionalSessionId\(sessionId,\s*\{\s*type:\s*'mode_changed',\s*mode\s*\}\)/.test(serverJs),
  'session-specific model and mode updates should include sessionId',
);
assert(
  /function\s+isCurrentSessionEvent\(msg\)/.test(appJs) &&
    /case 'text_delta':[\s\S]*isCurrentSessionEvent\(msg\)/.test(appJs) &&
    /case 'assistant_segment_start':[\s\S]*isCurrentSessionEvent\(msg\)/.test(appJs) &&
    /case 'tool_start':[\s\S]*isCurrentSessionEvent\(msg\)/.test(appJs) &&
    /case 'tool_end':[\s\S]*isCurrentSessionEvent\(msg\)/.test(appJs) &&
    /case 'cost':[\s\S]*isCurrentSessionEvent\(msg\)/.test(appJs) &&
    /case 'usage':[\s\S]*isCurrentSessionEvent\(msg\)/.test(appJs) &&
    /case 'done':[\s\S]*isCurrentSessionEvent\(msg\)/.test(appJs) &&
    /case 'system_message':[\s\S]*isCurrentSessionEvent\(msg\)/.test(appJs) &&
    /case 'error':[\s\S]*msg\.sessionId\s*&&\s*msg\.sessionId\s*!==\s*currentSessionId/.test(appJs) &&
    /case 'model_changed':[\s\S]*isCurrentSessionEvent\(msg\)/.test(appJs) &&
    /case 'mode_changed':[\s\S]*isCurrentSessionEvent\(msg\)/.test(appJs),
  'client runtime handlers should ignore stale stream events from non-current sessions',
);

console.log('session navigation state regression passed');
