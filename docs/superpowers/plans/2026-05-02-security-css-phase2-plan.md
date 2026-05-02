# CC-Web Security And CSS Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the current Markdown XSS path, continue CSS semantic decoupling beyond the Stage 1 file split, and end with a documented drawing-context review result.

**Architecture:** Keep the app as static HTML/CSS/JS without adding a build system. For Markdown, constrain marked output at the renderer/sanitization boundary instead of trusting raw HTML. For CSS, keep the Stage 1 import structure and migrate the next slice from component-level theme overrides toward shared semantic tokens.

**Tech Stack:** Vanilla browser JS, marked, highlight.js, Node regression scripts

---

### Task 1: Lock The Markdown XSS Regression

**Files:**
- Create: `scripts/markdown-security-regression.js`
- Modify: `package.json`
- Modify: `public/app.js`

- [ ] **Step 1: Write the failing regression script**
- [ ] **Step 2: Run it to confirm raw HTML and `javascript:` payloads are still unsafe**
- [ ] **Step 3: Implement minimal Markdown hardening in `public/app.js`**
- [ ] **Step 4: Re-run the new regression plus impacted UI regressions**
- [ ] **Step 5: Create a backup ref after green**

### Task 2: Continue CSS Semantic Decoupling

**Files:**
- Modify: `public/styles/10-theme-current.css`
- Modify: `public/styles/30-chat-tools.css`
- Modify: `public/styles/50-settings-modals.css`
- Modify: `scripts/theme-regression.js`
- Modify or create: additional CSS regression helper/checks as needed

- [ ] **Step 1: Add a failing static regression that enforces reduced cross-file theme leakage for the chosen slice**
- [ ] **Step 2: Move the next coherent slice of theme-specific component rules onto semantic tokens**
- [ ] **Step 3: Re-run theme, UI, and mobile regressions**
- [ ] **Step 4: Create a backup ref after green**

### Task 3: Drawing-Context Review

**Files:**
- Modify: `docs/2026-05-01-cc-web-change-record.md` (only if needed to capture the conclusion)
- No-code scan: `sessions/*.json`, relevant docs

- [ ] **Step 1: Re-scan session history and docs for any drawing-specific requirement trail**
- [ ] **Step 2: Record whether drawing context is actually present in this repo history or absent/ambiguous**
- [ ] **Step 3: Run final verification and report conclusions separately from implementation status**
