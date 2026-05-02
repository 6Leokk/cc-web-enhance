# CSS Theme Decoupling Stage 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split `public/style.css` into imported CSS modules without changing cascade behavior or visual output.

**Architecture:** Stage 1 is a behavior-preserving split. It prioritizes original source order over ideal responsibility boundaries, adds a shared CSS aggregation helper for regression scripts, and creates a Git backup before and after the split.

**Tech Stack:** Plain CSS `@import`, Node.js regression scripts, no frontend build step.

---

## Conflict Check With Security Follow-Up

This stage does not change markdown rendering, WebSocket auth, process completion logic, or server startup behavior.

The only overlap is regression scripts. CSS Stage 1 owns the CSS aggregation helper first. Later security work should reuse that helper rather than reimplement CSS reading.

## Files

- Modify: `public/style.css`
- Create: `public/styles/00-fonts.css`
- Create: `public/styles/10-theme-current.css`
- Create: `public/styles/20-base-layout.css`
- Create: `public/styles/30-chat-tools.css`
- Create: `public/styles/40-input-overlays.css`
- Create: `public/styles/50-settings-modals.css`
- Create: `scripts/read-public-css.js`
- Modify: `scripts/theme-regression.js`
- Modify: `scripts/ui-regression.js`
- Modify: `scripts/mobile-scroll-regression.js`

The numbered CSS modules are transitional. Later stages can rename or redistribute them into `tokens.css`, `themes.css`, `layout.css`, `chat.css`, and similar responsibility-based files after theme overrides are centralized.

## Task 1: Regression Helper First

- [ ] Add a failing assertion or temporary run showing existing regressions only inspect `public/style.css`.
- [ ] Create `scripts/read-public-css.js` that reads `public/style.css` and recursively inlines local `@import url('./styles/...')` files, while ignoring remote imports.
- [ ] Update `scripts/theme-regression.js`, `scripts/ui-regression.js`, and `scripts/mobile-scroll-regression.js` to use the helper.
- [ ] Run `npm run regression:theme`, `npm run regression:ui`, and `npm run regression:mobile-scroll`.
- [ ] Git backup/commit after the helper passes.

## Task 2: Mechanical CSS Split

- [ ] Split `public/style.css` by original continuous line ranges into numbered modules.
- [ ] Keep the Google Font import available through `public/styles/00-fonts.css`.
- [ ] Replace `public/style.css` with ordered local imports only.
- [ ] Do not move late theme overrides earlier in the cascade.
- [ ] Run `npm run regression:theme`, `npm run regression:ui`, and `npm run regression:mobile-scroll`.
- [ ] Git backup/commit after the split passes.

## Task 3: Sanity Audit

- [ ] Confirm combined CSS produced by `scripts/read-public-css.js` still contains `mono-night`, `overflow-anchor: none`, and the mono-night tool-call overrides.
- [ ] Confirm `public/index.html` still only references `style.css`.
- [ ] Check `git status --short` and list exactly which files belong to CSS Stage 1.
- [ ] Record any skipped full-regression limitation caused by missing `sqlite3`.

