# Session Navigation Reliability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate session-switch, foreground-resume, and iOS mobile scroll/navigation regressions by separating navigation intent from runtime/refresh state and covering the risky paths with deterministic regressions.

**Architecture:** Keep one explicit source of truth for frontend session-load provenance: which session is loading, why it is loading, and whether completion must anchor to the latest message. Route foreground active-session refreshes through that same load contract instead of ad hoc `load_session` calls, and stop runtime completion events from mutating navigation selection. Extend regressions at the static and end-to-end layers so the navigation contract is enforced.

**Tech Stack:** Vanilla browser JS in `public/app.js`, Node.js WebSocket backend in `server.js`, Node-based regression scripts in `scripts/*.js`.

---

## Recorded Problems

### Confirmed

1. Weak-cache session switching used to couple “must end at bottom” to `blocking`, so a non-blocking background sync after `showCachedSession()` could preserve an intermediate scroll position instead of the latest message.
2. Foreground restore for a running/current session still sends a raw `load_session` without `requestId` or explicit frontend load ownership. That path can interleave with an active session switch or background refresh and accept stale `session_info` / `session_history_chunk` responses because the frontend currently treats “same session + no requestId” as valid.
3. `finishGenerating(sessionId)` still writes back to `currentSessionId`, so runtime completion can mutate navigation state after `resetChatView()` or other selection changes.

### Observed But Not Yet Fully Proven

4. On iOS, returning from another app to Safari can still land the message list around the middle. The most likely root cause is the foreground running-session refresh path above, but idle-session Safari scroll restoration needs to be distinguished from running-session replay before broadening the fix.

### Current Workspace Context

5. The worktree already contains uncommitted fixes for title edit theming and weak-cache bottom anchoring in `public/app.js`, `public/styles/20-base-layout.css`, `scripts/theme-regression.js`, and `scripts/mobile-scroll-regression.js`. Do not overwrite them while implementing the tasks below; integrate on top of them.

---

### Task 1: Codify Foreground Resume Failures

**Files:**
- Modify: `scripts/mobile-scroll-regression.js`
- Create: `scripts/foreground-session-refresh-regression.js`
- Modify: `package.json`
- Reference: `public/app.js:1456-1473`
- Reference: `public/app.js:5386-5402`
- Reference: `server.js:2929-3011`

- [x] **Step 1: Write the failing foreground-refresh regression**

Create `scripts/foreground-session-refresh-regression.js` that:
- starts the local server with temp config/session dirs;
- opens one active session that is still running;
- simulates a foreground refresh while the same browser is still attached;
- asserts that the refresh request carries a unique `requestId` and that only matching `session_info` / `session_history_chunk` responses are accepted.

- [x] **Step 2: Run the new regression to verify it fails on current behavior**

Run: `node scripts/foreground-session-refresh-regression.js`
Expected: FAIL because the current foreground-running path sends `load_session` without `requestId` and does not mark a dedicated active load contract.

- [x] **Step 3: Strengthen the static guard in `scripts/mobile-scroll-regression.js`**

Add assertions that the `visibilitychange` visible path for running sessions does not use a naked:

```js
send({ type: 'load_session', sessionId: currentSessionId });
```

and instead routes through the shared session-load contract used by normal session switching.

- [x] **Step 4: Run the focused static regression**

Run: `npm run regression:mobile-scroll`
Expected: FAIL until the frontend foreground path is moved to the shared contract.

- [ ] **Step 5: Commit the red tests only**

```bash
git add scripts/mobile-scroll-regression.js scripts/foreground-session-refresh-regression.js package.json
git commit -m "test: codify foreground session refresh navigation contract"
```

### Task 2: Unify Foreground Running-Session Refresh With Session-Load Ownership

**Files:**
- Modify: `public/app.js:1419-1538`
- Modify: `public/app.js:5386-5402`
- Reference: `public/app.js:1822-1849`
- Reference: `server.js:2929-3011`
- Test: `scripts/mobile-scroll-regression.js`
- Test: `scripts/foreground-session-refresh-regression.js`

- [x] **Step 1: Replace the ad hoc foreground running-session refresh entrypoint**

Change the visible `visibilitychange` branch so running/current-session refreshes go through the same contract as explicit navigation. The target shape is:

```js
openSession(currentSessionId, {
  forceSync: true,
  blocking: false,
  anchorToBottom: messagesWereNearBottomBeforeHidden,
  label: '正在恢复当前会话…',
});
```

instead of sending a raw `load_session`.

- [x] **Step 2: Keep load provenance explicit in `activeSessionLoad`**

Ensure `beginSessionSwitch()` / `setSessionLoading()` continue carrying:
- `sessionId`
- `requestId`
- `blocking`
- `anchorToBottom`

and that foreground refreshes populate these fields just like sidebar navigation does.

- [x] **Step 3: Make non-matching no-`requestId` responses ineligible during an active owned load**

Tighten `shouldApplySessionInfo()` and `shouldApplySessionHistoryChunk()` so that once the frontend owns an active load, only the matching `requestId` path is accepted. If a load source cannot supply a `requestId`, it should not share this code path.

- [x] **Step 4: Run focused regressions to verify the fix**

Run:
- `node scripts/foreground-session-refresh-regression.js`
- `npm run regression:mobile-scroll`

Expected: PASS.

- [ ] **Step 5: Commit the unified foreground-refresh fix**

```bash
git add public/app.js scripts/mobile-scroll-regression.js scripts/foreground-session-refresh-regression.js package.json
git commit -m "fix: unify foreground session refresh with owned load state"
```

### Task 3: Stop Runtime Completion From Mutating Navigation Selection

**Files:**
- Modify: `public/app.js:2174-2214`
- Modify: `scripts/ui-regression.js`
- Create: `scripts/session-navigation-state-regression.js`
- Modify: `package.json`
- Reference: `public/app.js:1314-1337`
- Reference: `server.js:3075-3085`

- [x] **Step 1: Write the failing navigation-state regression**

Create `scripts/session-navigation-state-regression.js` that reproduces:
1. start or resume a running session;
2. clear or switch away from the current view;
3. deliver a `done` event for the previous session;
4. assert that the frontend does not restore `currentSessionId` to the completed/removed session.

- [x] **Step 2: Run the regression to verify it fails**

Run: `node scripts/session-navigation-state-regression.js`
Expected: FAIL because `finishGenerating(sessionId)` currently does:

```js
if (sessionId) currentSessionId = sessionId;
```

- [x] **Step 3: Remove runtime-to-navigation backwrite from `finishGenerating()`**

Adjust `finishGenerating()` so it only finalizes rendering/runtime state for the stream that ended. Navigation state must be owned by `applySessionSnapshot()`, `resetChatView()`, and explicit `openSession()` flows, not by the runtime `done` message.

- [x] **Step 4: Add a static guard in `scripts/ui-regression.js`**

Assert that `finishGenerating(sessionId)` no longer assigns to `currentSessionId`, and that deletion/reset paths remain the only owners of selection changes.

- [x] **Step 5: Run focused regressions**

Run:
- `node scripts/session-navigation-state-regression.js`
- `npm run regression:ui`

Expected: PASS.

- [ ] **Step 6: Commit the runtime/navigation separation fix**

```bash
git add public/app.js scripts/ui-regression.js scripts/session-navigation-state-regression.js package.json
git commit -m "fix: separate runtime completion from session selection"
```

### Task 4: Verify the iOS Idle Foreground Path and Patch Only If Needed

**Files:**
- Modify: `public/app.js:172-243`
- Modify: `public/app.js:5386-5414`
- Modify: `scripts/mobile-scroll-regression.js`
- Update: `docs/2026-05-01-cc-web-change-record.md`

- [ ] **Step 1: Reproduce whether the iOS jump-to-middle still occurs after Tasks 2 and 3**

Manual test matrix on iPhone/iOS Safari:
1. idle session at bottom → switch to another app → return;
2. running session at bottom → switch to another app → return;
3. idle session scrolled to history → switch app → return.

Record whether each case lands at bottom, preserves history position, or jumps to a middle position unexpectedly.

- [ ] **Step 2: If the idle bottom case still fails, add minimal evidence gathering first**

Add a temporary debug trace gated behind a local flag such as:

```js
window.__CC_DEBUG_SCROLL__ = true
```

and log:
- hidden/visible/pageshow timestamps,
- `messagesWereNearBottomBeforeHidden`,
- `scrollTop`, `scrollHeight`, `clientHeight`,
- whether `forceMessagesBottomAfterForeground()` ran.

Use one repro pass to determine whether the remaining issue is:
- Safari late scroll restoration after the current 1200 ms anchor window, or
- a frontend state-path bug that still re-renders/preserves scroll incorrectly.

- [ ] **Step 3: Apply the smallest targeted fix only after evidence is collected**

Candidate fixes, in order:
1. extend/retime the delayed bottom-anchor schedule if Safari restoration arrives after the current window;
2. route one additional idle foreground path through explicit anchor ownership if a hidden render path is discovered;
3. avoid any new unconditional “always go bottom” logic for users who intentionally left the view in history.

- [ ] **Step 4: Lock the confirmed behavior into `scripts/mobile-scroll-regression.js`**

Add assertions only for the proven case. Do not guess. If the issue is a timing-window problem, codify the expected delayed-anchor schedule or visible-path trigger that fixes it.

- [ ] **Step 5: Update the change record after verification**

Document:
- the final iOS root cause,
- whether it affected running sessions only or idle sessions too,
- the regression coverage added.

- [ ] **Step 6: Commit the iOS foreground stabilization follow-up**

```bash
git add public/app.js scripts/mobile-scroll-regression.js docs/2026-05-01-cc-web-change-record.md
git commit -m "fix: stabilize iOS foreground session scroll restoration"
```

### Task 5: Full Verification and Cleanup

**Files:**
- Modify: `package.json` if new regression scripts were added
- Verify: `public/app.js`
- Verify: `server.js`
- Verify: `scripts/mobile-scroll-regression.js`
- Verify: `scripts/ui-regression.js`
- Verify: new regression scripts from Tasks 1 and 3

- [x] **Step 1: Run syntax validation**

Run:
- `node -c public/app.js`
- `node -c server.js`
- `node -c scripts/mobile-scroll-regression.js`
- `node -c scripts/foreground-session-refresh-regression.js`
- `node -c scripts/session-navigation-state-regression.js`

Expected: no syntax errors.

- [x] **Step 2: Run focused regressions**

Run:
- `npm run regression:mobile-scroll`
- `npm run regression:ui`
- `node scripts/foreground-session-refresh-regression.js`
- `node scripts/session-navigation-state-regression.js`

Expected: all PASS.

- [x] **Step 3: Run the aggregate regression suite**

Run: `npm run regression`
Expected: `Regression checks passed.`

- [ ] **Step 4: Inspect the worktree before handoff**

Run:

```bash
git status --short
git diff --stat
```

Expected: only the intended navigation/foreground/docs/regression files are modified.

- [ ] **Step 5: Commit the verification pass**

```bash
git add public/app.js server.js scripts/mobile-scroll-regression.js scripts/ui-regression.js scripts/foreground-session-refresh-regression.js scripts/session-navigation-state-regression.js docs/2026-05-01-cc-web-change-record.md package.json
git commit -m "test: verify session navigation reliability fixes"
```
