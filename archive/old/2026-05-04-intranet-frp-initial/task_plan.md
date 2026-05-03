# Task Plan: cc-web-enhance intranet frp safe access

## Goal
Add safe intranet remote access support for `cc-web-enhance` with frp-first deployment docs, secure host/port defaults, regression coverage, and branch audit records, then commit and push the branch.

## Current Phase
Complete

## Phases

### Phase 1: Discovery, design, and audit docs
- [x] Read current repo structure and entry points
- [x] Capture requirements and safety boundaries
- [x] Write threat model, design doc, deployment doc, branch progress doc
- **Status:** complete

### Phase 2: Safety-first test design
- [x] Add failing regression coverage for default bind behavior and frp artifact safety
- [x] Add script-level safety checks
- [x] Verify the new tests fail before implementation
- **Status:** complete

### Phase 3: Minimal implementation
- [x] Add `CC_WEB_HOST` / `CC_WEB_PORT` support with validation
- [x] Add frp example configs and helper scripts
- [x] Update README and environment docs
- **Status:** complete

### Phase 4: Verification
- [x] Run regression, node syntax checks, bash syntax checks, and grep-based safety scans
- [x] Fix failures and record results
- **Status:** complete

### Phase 5: Commit, review, and delivery
- [x] Record branch progress and security review
- [x] Commit staged changes in logical chunks
- [x] Push `feature/intranet-access-frp-safe` to origin
- **Status:** complete

## Key Questions
1. Can the repo keep backward compatibility with `HOST` / `PORT` while adding `CC_WEB_HOST` / `CC_WEB_PORT`?
2. How much behavior should move into a dedicated config helper versus staying in `server.js`?

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| Prefer `CC_WEB_HOST` / `CC_WEB_PORT` with `HOST` / `PORT` fallback | Adds the requested interface without breaking existing docs or scripts |
| Default to `127.0.0.1:8083` | Matches the desired safe default and keeps frp usage local-only by default |
| Keep frp support file-only, no binaries or services | Avoids bundling mutable infrastructure or credentials |
| Use isolated tests and static scans | Covers safety boundaries without touching live services |

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| `rg` unavailable in the container | 1 | Switched to `git ls-files`, `grep`, and `find` |

## Notes
- Update this file after each completed phase.
- Do not rely on memory for safety checks; record them here.
