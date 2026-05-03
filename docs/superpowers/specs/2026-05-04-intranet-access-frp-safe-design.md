# Intranet Access Frp Safe Design

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add safe frp-first intranet remote access support for `cc-web-enhance` without changing the default local-only security posture.

**Architecture:** Keep `cc-web` bound to `127.0.0.1:8083` by default, add a testable bind resolver for `CC_WEB_HOST` / `CC_WEB_PORT` with legacy fallback, and ship placeholder-only frp docs/config/scripts that only forward to the local loopback service. Use offline regression tests and static scans to verify that examples, scripts, and docs do not expose secrets or unsafe defaults.

**Tech Stack:** Node.js, bash, TOML examples, existing regression scripts, markdown docs

---

## Scope
- Default bind remains local-only.
- frp examples are documentation-only.
- helper scripts remain non-invasive and offline.
- regression coverage checks safety boundaries.

## Non-Goals
- No tunnel provider abstraction implementation yet.
- No automatic frp installation.
- No public DNS / certificate automation.
- No binary packaging.

## Review Notes
- Manual review fallback will be used if subagent delegation is not available in this environment.
