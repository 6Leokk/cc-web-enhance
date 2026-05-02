# Security Defects Follow-Up Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the security and stability defects found during the CC-Web review after the CSS decoupling Stage 1 work lands.

**Architecture:** This plan is intentionally separate from the CSS decoupling work. It touches markdown rendering, process completion ordering, authentication IP handling, port-conflict behavior, and full-regression dependency diagnostics. The only shared surface with the CSS plan is the regression script area, so CSS aggregation helpers should be completed first.

**Tech Stack:** Node.js, browser DOM APIs, marked, ws, shell-based regression scripts.

---

## Conflict Check With CSS Decoupling

No direct implementation conflict is expected with CSS Stage 1.

Shared areas:

- `scripts/theme-regression.js`, `scripts/ui-regression.js`, and `scripts/mobile-scroll-regression.js` are touched by CSS Stage 1 so they can read imported CSS. Security follow-up should not modify those same checks until CSS Stage 1 is merged or committed.
- `public/app.js` will be touched by the XSS fix later. CSS Stage 1 should avoid touching `public/app.js`.
- `server.js` will be touched by process-completion, forwarded-IP, and port-conflict fixes later. CSS Stage 1 should avoid touching `server.js`.

Recommended order:

1. Complete CSS Stage 1 and commit it.
2. Fix markdown XSS.
3. Fix process-completion ordering.
4. Fix forwarded-IP trust boundary.
5. Fix port-conflict behavior.
6. Fix `sqlite3` dependency diagnostics in full regression.

## Task 1: Harden Markdown Rendering

**Files:**

- Modify: `public/index.html`
- Modify: `public/app.js`
- Test: add or update a focused regression script, likely `scripts/ui-regression.js`

- [ ] Add a failing regression that rejects raw HTML execution surfaces in assistant markdown.
- [ ] Add a sanitizer such as DOMPurify, or disable raw HTML before assigning rendered markdown to `innerHTML`.
- [ ] Ensure code block highlighting and HTML/SVG preview still work only through the explicit preview iframe path.
- [ ] Run `npm run regression:ui`.
- [ ] Commit: `fix: sanitize assistant markdown rendering`.

## Task 2: Final Tail Before Completion Classification

**Files:**

- Modify: `server.js`
- Test: `scripts/regression.js` or a focused new process-completion regression

- [ ] Add a failing regression where runtime output is written immediately before process exit.
- [ ] Move the final `entry.tailer.readNew()` before `contextLimitExceeded` and `shouldTreatCompletionAsError` are computed.
- [ ] Run the focused regression.
- [ ] Commit: `fix: classify process completion after final tail`.

## Task 3: Trusted Proxy Boundary For Client IP

**Files:**

- Modify: `server.js`
- Test: focused auth regression or `scripts/regression.js`

- [ ] Add a failing regression showing unauthenticated clients cannot bypass brute-force tracking with arbitrary `X-Forwarded-For`.
- [ ] Default to `req.socket.remoteAddress`.
- [ ] Add an explicit env switch for trusted proxy deployments before honoring `X-Forwarded-For`.
- [ ] Run auth-related regression.
- [ ] Commit: `fix: trust forwarded IP only behind configured proxy`.

## Task 4: Remove Default Port Process Killing

**Files:**

- Modify: `server.js`
- Test: focused startup regression if practical

- [ ] Add or update a regression/inspection check that `EADDRINUSE` does not kill unrelated processes by default.
- [ ] Gate `killPortOccupant()` behind an explicit env flag, or remove the auto-kill path.
- [ ] Run the focused check.
- [ ] Commit: `fix: do not kill port occupants by default`.

## Task 5: Improve Full Regression SQLite Diagnostics

**Files:**

- Modify: `scripts/regression.js`

- [ ] Add handling for `spawnSync('sqlite3')` `ENOENT`.
- [ ] Emit a clear error message that full regression requires the `sqlite3` CLI.
- [ ] Run `npm run regression` on an environment with `sqlite3`, or document that local verification is blocked by missing dependency.
- [ ] Commit: `test: clarify sqlite3 dependency for full regression`.

