# Intranet Access Frp Safe Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship safe frp-based intranet remote access support for `cc-web-enhance` with docs, tests, and security checks, while preserving the default local-only bind.

**Architecture:** Put bind resolution in a small helper so tests can exercise it directly, keep frp artifacts as placeholder-only files under `deploy/frp/`, and make scripts and regression checks fully offline. Update the main README only with a short entry point and keep detailed instructions in docs.

**Tech Stack:** Node.js, bash, markdown, TOML, existing regression harness

---

### Task 1: Write failing safety tests

**Files:**
- Create: `scripts/intranet-frp-safety-regression.js`
- Modify: `package.json`

- [x] **Step 1: Write the failing test**
- [x] **Step 2: Run test to verify it fails**
- [x] **Step 3: Write minimal implementation**
- [x] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit**

### Task 2: Implement bind resolution

**Files:**
- Create: `lib/server-config.js`
- Modify: `server.js`

- [x] **Step 1: Write the failing test**
- [x] **Step 2: Run test to verify it fails**
- [x] **Step 3: Write minimal implementation**
- [x] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit**

### Task 3: Add frp deployment assets

**Files:**
- Create: `deploy/frp/frps.example.toml`
- Create: `deploy/frp/frpc.example.toml`
- Create: `deploy/frp/README.md`
- Create: `scripts/frp/check-frp-config.sh`
- Create: `scripts/frp/check-local-cc-web.sh`
- Create: `scripts/frp/README.md`

- [x] **Step 1: Write the failing test**
- [x] **Step 2: Run test to verify it fails**
- [x] **Step 3: Write minimal implementation**
- [x] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit**

### Task 4: Update docs and README

**Files:**
- Modify: `README.md`
- Modify: `README.en.md`
- Create: `docs/intranet-access-design.md`
- Create: `docs/deploy-frp.md`
- Create: `docs/security/intranet-access-threat-model.md`

- [x] **Step 1: Write the failing test**
- [x] **Step 2: Run test to verify it fails**
- [x] **Step 3: Write minimal implementation**
- [x] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Commit**

### Task 5: Verification and release prep

**Files:**
- Modify: `docs/branch-progress/intranet-access-frp-safe.md`
- Modify: `progress.md`
- Modify: `findings.md`
- Modify: `task_plan.md`

- [ ] **Step 1: Run regression and syntax checks**
- [ ] **Step 2: Run grep-based security scans**
- [ ] **Step 3: Record results and residual risks**
- [ ] **Step 4: Commit**
