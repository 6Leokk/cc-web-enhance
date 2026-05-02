# CC-Web Refresh, Status, And Resume Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve LAN refresh performance, show structured Codex reasoning effort in the UI, and stop occasional foreground-return jumps into chat history.

**Architecture:** Keep the current static Node-served frontend, but make shell-vs-asset delivery policies explicit, localize critical browser dependencies, and carry structured `reasoningEffort` state through the existing `session_info` pipeline. Tighten foreground restore behavior by anchoring only on hide-time user intent instead of broad post-restore heuristics.

**Tech Stack:** Node.js HTTP/WebSocket server, static HTML/CSS/JS frontend, existing regression scripts, local vendor browser assets.

---

## File Map

- Modify: `server.js`
  - Static asset cache/validation behavior
  - Structured `reasoningEffort` in session payloads
- Modify: `lib/agent-runtime.js`
  - Codex spawn/runtime handling with separate reasoning effort
- Modify: `lib/codex-rollouts.js`
  - Import Codex reasoning effort from rollout metadata
- Modify: `public/index.html`
  - Replace CDN bootstrap dependencies with local vendor paths
- Modify: `public/app.js`
  - Structured model display
  - Foreground restore intent logic
- Create: `public/vendor/marked.min.js`
- Create: `public/vendor/highlight.min.js`
- Create: `public/vendor/highlight-atom-one-dark.min.css`
- Create: `public/vendor/purify.min.js`
- Modify: `scripts/ui-regression.js`
  - Asset-localization/cache-logic assertions
  - Structured reasoning effort assertions
- Create: `scripts/foreground-restore-regression.js`
  - Focused foreground-return intent assertions
- Modify: `docs/2026-05-01-cc-web-change-record.md`
  - Record final implementation outcomes

## Task 1: Lock Regression Coverage First

**Files:**
- Modify: `scripts/ui-regression.js`
- Create: `scripts/foreground-restore-regression.js`

- [ ] **Step 1: Write failing assertions for structured model reasoning-effort**

Add assertions that require:

- `session_info` transport to contain a separate `reasoningEffort` field
- client snapshot normalization to preserve `reasoningEffort`
- UI model formatting to combine `model + reasoningEffort` into `gpt-5.4(xhigh)`

- [ ] **Step 2: Run UI regression to verify it fails**

Run:

```bash
npm run regression:ui
```

Expected: FAIL because `reasoningEffort` is not yet transported or rendered structurally.

- [ ] **Step 3: Write failing assertions for refresh/bootstrap delivery**

Add assertions that require:

- `public/index.html` to stop referencing third-party CDN runtime assets
- server static delivery logic to distinguish `index.html` from local JS/CSS assets
- server static delivery logic to expose validation/caching behavior for non-shell assets

- [ ] **Step 4: Run UI regression to verify it still fails for the new delivery assertions**

Run:

```bash
npm run regression:ui
```

Expected: FAIL because CDN references and cache policy are still old.

- [ ] **Step 5: Create a focused foreground restore regression**

Write `scripts/foreground-restore-regression.js` to require:

- a dedicated hide-time foreground restore intent flag
- narrower restore heuristics than the current broad `activeElement/near-bottom` checks
- separate handling for “foreground return should re-anchor” vs. “viewport resize happened”

- [ ] **Step 6: Run the new foreground restore regression to verify it fails**

Run:

```bash
node scripts/foreground-restore-regression.js
```

Expected: FAIL because the narrower intent contract does not exist yet.

## Task 2: Implement Structured Model + Reasoning Effort

**Files:**
- Modify: `server.js`
- Modify: `lib/agent-runtime.js`
- Modify: `lib/codex-rollouts.js`
- Modify: `public/app.js`

- [ ] **Step 1: Add a normalized session-level `reasoningEffort` field on the server**

Update session normalization and session creation/import paths so Codex reasoning effort is stored separately from `model`.

- [ ] **Step 2: Parse reasoning effort from Codex config/runtime sources**

Use existing `splitCodexModelSpec()` and Codex rollout metadata so the server can preserve:

- `model = gpt-5.4`
- `reasoningEffort = xhigh`

- [ ] **Step 3: Update `session_info` and `model_changed` payloads**

Send structured fields to the client without packing effort back into `model`.

- [ ] **Step 4: Update client state normalization and display formatting**

Add a shared formatter that renders:

- `gpt-5.4(xhigh)` when both fields exist
- `gpt-5.4` when only base model exists

- [ ] **Step 5: Run the UI regression and verify the model-related assertions pass**

Run:

```bash
npm run regression:ui
```

Expected: the new structured model assertions pass; refresh/foreground assertions may still fail.

## Task 3: Improve LAN Refresh Delivery

**Files:**
- Modify: `server.js`
- Modify: `public/index.html`
- Create: `public/vendor/marked.min.js`
- Create: `public/vendor/highlight.min.js`
- Create: `public/vendor/highlight-atom-one-dark.min.css`
- Create: `public/vendor/purify.min.js`

- [ ] **Step 1: Localize critical browser vendor assets**

Copy the currently used runtime assets into `public/vendor/` and update `public/index.html` to use local paths instead of CDN URLs.

- [ ] **Step 2: Differentiate shell vs. asset cache policy**

Keep `index.html` as `no-cache`, but add validation/caching behavior for non-shell static assets.

- [ ] **Step 3: Add conditional response support**

Implement lightweight validation handling such as `ETag` and/or `Last-Modified` so repeat LAN refreshes avoid full asset transfers when unchanged.

- [ ] **Step 4: Run the UI regression and verify refresh-delivery assertions pass**

Run:

```bash
npm run regression:ui
```

Expected: CDN-removal and asset-delivery assertions pass.

## Task 4: Tighten Foreground Restore Intent

**Files:**
- Modify: `public/app.js`
- Test: `scripts/foreground-restore-regression.js`

- [ ] **Step 1: Introduce an explicit foreground-return intent state**

Capture whether the user was bottom-pinned at hide/pagehide time, separate from generic viewport bottom tracking.

- [ ] **Step 2: Narrow restore-time re-anchoring heuristics**

Reduce reliance on restore-time focus/viewport states such as `document.activeElement === msgInput` when deciding to force bottom anchoring.

- [ ] **Step 3: Keep repeated delayed anchoring only for the explicit bottom-pinned return case**

Preserve the existing iOS stabilization benefit without over-applying it to users who were reading history.

- [ ] **Step 4: Run the focused foreground restore regression and verify it passes**

Run:

```bash
node scripts/foreground-restore-regression.js
```

Expected: PASS.

- [ ] **Step 5: Run the broader session/scroll regression**

Run:

```bash
node scripts/mobile-scroll-regression.js
```

Expected: PASS, confirming the new intent logic does not regress existing navigation protections.

## Task 5: Record And Verify End State

**Files:**
- Modify: `docs/2026-05-01-cc-web-change-record.md`

- [ ] **Step 1: Update the local change record**

Record:

- structured `reasoningEffort` transport/display
- local vendor asset delivery and cache behavior changes
- foreground restore intent tightening

- [ ] **Step 2: Run final syntax and regression checks**

Run:

```bash
node --check server.js
node --check lib/agent-runtime.js
node --check lib/codex-rollouts.js
node --check public/app.js
npm run regression:ui
node scripts/foreground-restore-regression.js
node scripts/mobile-scroll-regression.js
git diff --check
```

Expected: all commands pass cleanly.

- [ ] **Step 3: Commit the implementation**

```bash
git add server.js lib/agent-runtime.js lib/codex-rollouts.js public/index.html public/app.js public/vendor scripts/ui-regression.js scripts/foreground-restore-regression.js docs/2026-05-01-cc-web-change-record.md
git commit -m "fix: improve refresh status and foreground restore"
```
