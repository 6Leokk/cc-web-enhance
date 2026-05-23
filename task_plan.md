# Task Plan: Tunnel and Direct Access Design

## Goal
Design a unified access experience for `cc-web-enhance` that supports local-only use, LAN sharing, intranet hosts through ngrok/frp, public hosts through direct binding or reverse proxy, and preserves a simple default path for non-technical users.

## Current Phase
Phase 5

## Phases

### Phase 1: Init Scan and Discovery
- [x] Confirm current branch and project shape
- [x] Identify current frp integration points
- [x] Identify existing direct-host configuration points
- [x] Document scan findings in `findings.md`
- **Status:** complete

### Phase 2: Language and Runtime Fit
- [x] Assess whether Node.js/CommonJS is still the right implementation language
- [x] Compare practical alternatives without recommending unnecessary rewrites
- [x] Record language decision and trade-offs
- **Status:** complete

### Phase 3: Access Mode Design
- [x] Define user-facing modes: direct browser access, public-host direct, ngrok tunnel, frp self-hosted
- [x] Define environment variables and config storage
- [x] Define startup, status, shutdown, and UI flows
- [x] Define migration path from current `FRP_*` variables
- **Status:** complete

### Phase 4: Documentation Draft
- [x] Draft a design/spec document after user approval of the design direction
- [x] Include small-user quick start and advanced deployment paths
- [x] Include quick-login interaction design
- [x] Include security boundaries and test strategy
- **Status:** complete

### Phase 5: Handoff to Implementation Planning
- [x] Ask for user approval of the recorded design
- [x] Transition to implementation planning after approval
- [x] Record detailed implementation code structure
- [x] Supplement spec with scoped access-subsystem redesign
- [x] Run gpt-5.4 subagent review and address Not Ready findings
- [ ] Wait for user review before writing runtime code
- **Status:** in_progress

## Key Questions
1. Should `ngrok` become the default recommended tunnel provider for first-time users while frp remains available for self-hosted deployments?
2. Should local-only and LAN sharing be merged into one direct browser access mode with an internal scope?
3. Should tunnel configuration live only in `.env`, or also be editable from the Web UI and stored in `config/tunnel.json`?
4. How much automatic detection is acceptable before it becomes risky for security?

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| Keep current frp support in the design | Existing frp integration is already complete and serves self-hosted/VPS users well. |
| Merge local and LAN into direct browser access | It matches how small users think: open the web page on this machine or another device on the same network. |
| Treat public-host direct access as a separate deployment mode | Some users do not need NAT traversal; forcing tunnel setup would add unnecessary complexity. |
| Prefer explicit access mode selection over fully automatic exposure | Direct public binding and tunnels change the attack surface; the user should opt in. |
| Keep Node.js/CommonJS for this feature | It best matches the existing browser/WebSocket/child-process architecture and avoids a risky rewrite. |
| Use `CC_WEB_ACCESS_MODE` as the top-level concept | It covers direct browser access, public server access, and tunnel providers without overloading `TUNNEL_PROVIDER`. |
| Use ngrok SDK, not ngrok CLI binary management | It avoids cross-platform extraction/process-control complexity and feels more integrated. |
| Make quick login one-time and short-lived | It reduces friction for small users without weakening the normal password/session model. |
| Add focused access modules before touching `server.js` integration | This keeps tunnel/provider concerns testable and avoids expanding the already-large server entrypoint. |
| Redesign only the access subsystem, not the whole project runtime | This gives a stable provider foundation without disrupting auth, sessions, agents, or the Node.js deployment model. |

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| `rg` is unavailable in this workspace | 1 | Used `find` and `grep` for project scanning. |
| `grep` command with unescaped backticks failed | 1 | Re-ran the document check with simpler quoted patterns. |
| Second `grep` command with unescaped backticks failed during review triage | 1 | Kept the useful output, then patched docs directly and avoided backtick patterns. |

## Notes
- This plan is for design and documentation only until the user approves the design.
- Do not implement ngrok or tunnel code before the design gate is accepted.
