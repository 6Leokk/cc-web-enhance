#!/usr/bin/env node

const fs = require('fs');
const os = require('os');
const path = require('path');
const { createCodexRolloutStore } = require('../lib/codex-rollouts');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function mkdirp(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeRollout(filePath, { threadId, title, cwd }) {
  const lines = [
    JSON.stringify({
      timestamp: '2026-05-03T00:00:00.000Z',
      type: 'session_meta',
      payload: { id: threadId, cwd, cli_version: '0.114.0', source: 'exec' },
    }),
    JSON.stringify({
      timestamp: '2026-05-03T00:00:00.100Z',
      type: 'event_msg',
      payload: { type: 'user_message', message: title },
    }),
    JSON.stringify({
      timestamp: '2026-05-03T00:00:00.200Z',
      type: 'response_item',
      payload: {
        type: 'message',
        role: 'assistant',
        content: [{ type: 'output_text', text: 'answer' }],
      },
    }),
  ];
  fs.writeFileSync(filePath, `${lines.join('\n')}\n`);
}

async function main() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-web-rollout-cache-'));
  const codexSessionsDir = path.join(tempRoot, '.codex', 'sessions', '2026', '05', '03');
  const sessionsDir = path.join(tempRoot, 'sessions');
  mkdirp(codexSessionsDir);
  mkdirp(sessionsDir);

  const rolloutPath = path.join(codexSessionsDir, 'rollout-2026-05-03T00-00-00-thread-1.jsonl');
  writeRollout(rolloutPath, {
    threadId: 'thread-1',
    title: 'First title',
    cwd: '/tmp/project-a',
  });

  const originalReadFileSync = fs.readFileSync;
  let rolloutReadCount = 0;
  fs.readFileSync = function patchedReadFileSync(filePath, ...args) {
    if (path.resolve(String(filePath)) === path.resolve(rolloutPath)) {
      rolloutReadCount += 1;
    }
    return originalReadFileSync.call(this, filePath, ...args);
  };

  try {
    const store = createCodexRolloutStore({
      codexSessionsDir: path.join(tempRoot, '.codex', 'sessions'),
      sessionsDir,
      normalizeSession: (session) => session,
      sanitizeToolInput: (_name, value) => value,
    });

    assert(typeof store.listCodexSessions === 'function', 'Expected rollout store to expose listCodexSessions()');
    assert(typeof store.findCodexRolloutPathByThreadId === 'function', 'Expected rollout store to expose findCodexRolloutPathByThreadId()');

    const firstList = store.listCodexSessions();
    assert(firstList.length === 1, `Expected one rollout summary, got ${JSON.stringify(firstList)}`);
    assert(firstList[0].threadId === 'thread-1', `Expected rollout summary to preserve thread id, got ${JSON.stringify(firstList[0])}`);
    const readsAfterFirstList = rolloutReadCount;
    assert(readsAfterFirstList >= 1, `Expected first summary build to read the rollout file, got ${readsAfterFirstList}`);

    const secondList = store.listCodexSessions();
    assert(secondList.length === 1, `Expected cached rollout summary to still list one session, got ${JSON.stringify(secondList)}`);
    assert(rolloutReadCount === readsAfterFirstList, `Expected unchanged rollout summary listing to reuse cache, got reads ${rolloutReadCount} after ${readsAfterFirstList}`);

    const resolvedPath = store.findCodexRolloutPathByThreadId('thread-1');
    assert(path.resolve(resolvedPath) === path.resolve(rolloutPath), `Expected cached thread lookup to resolve rollout path, got ${resolvedPath}`);
    assert(rolloutReadCount === readsAfterFirstList, `Expected cached thread lookup to avoid rereading unchanged rollout, got reads ${rolloutReadCount} after ${readsAfterFirstList}`);

    await new Promise((resolve) => setTimeout(resolve, 20));
    writeRollout(rolloutPath, {
      threadId: 'thread-1',
      title: 'Updated title',
      cwd: '/tmp/project-b',
    });

    const refreshedList = store.listCodexSessions();
    assert(refreshedList[0].title === 'Updated title', `Expected modified rollout title to invalidate cache, got ${JSON.stringify(refreshedList[0])}`);
    assert(rolloutReadCount > readsAfterFirstList, `Expected modified rollout file to be reread after invalidation, got reads ${rolloutReadCount} after ${readsAfterFirstList}`);
  } finally {
    fs.readFileSync = originalReadFileSync;
  }

  console.log('codex rollout cache regression passed');
}

main().catch((err) => {
  console.error(err.stack || err.message);
  process.exit(1);
});
