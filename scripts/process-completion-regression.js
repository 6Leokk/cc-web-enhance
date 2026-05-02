#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const serverJs = fs.readFileSync(path.join(root, 'server.js'), 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const handleMatch = serverJs.match(/function handleProcessComplete\(sessionId, exitCode, signal\) \{[\s\S]*?\n\}/);
assert(handleMatch, 'handleProcessComplete implementation is missing');

const body = handleMatch[0];
const finalReadIdx = body.indexOf('entry.tailer.readNew()');
const classifyIdx = body.indexOf('shouldTreatCompletionAsError(');
const contextIdx = body.indexOf('contextLimitExceeded = isContextLimitError(');

assert(finalReadIdx >= 0, 'handleProcessComplete should do a final tail read');
assert(classifyIdx >= 0, 'handleProcessComplete should classify completion errors');
assert(contextIdx >= 0, 'handleProcessComplete should detect context-limit failures');
assert(
  finalReadIdx < contextIdx && finalReadIdx < classifyIdx,
  'handleProcessComplete must read the final runtime output before computing context-limit and completion-error classification',
);

console.log('process completion regression checks passed');
