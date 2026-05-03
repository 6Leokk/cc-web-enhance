# Intranet Access Security Review

## Round 1: Pre-implementation Threat Model
- File: `docs/security/intranet-access-threat-model.md`
- Result: Completed before implementation.
- Key constraints:
  - Keep cc-web bound to `127.0.0.1:8083` by default.
  - Do not commit frp tokens, real public endpoints, or Codex runtime auth/config copies.
  - Do not enable frps dashboard by default.

## Round 2: Post-implementation Static Review
- Date: 2026-05-04
- Result: Passed with documented allowed findings.

Commands and results:
- `npm run regression`: passed.
- `npm run regression:notify`: passed.
- `npm run regression:notify-foreground`: passed.
- `npm run regression:auth-ip`: passed.
- `npm run regression:port-safety`: passed.
- `git ls-files '*.js' ':!:public/vendor/*' | xargs -r -n 1 node --check`: passed.
- `bash -n scripts/frp/*.sh`: passed.
- `bash scripts/frp/check-frp-config.sh deploy/frp/frps.example.toml deploy/frp/frpc.example.toml`: passed.
- `curl -sS --max-time 3 -I http://127.0.0.1:8083/`: returned HTTP 200 headers only; no auth write.
- `find /tmp ... .codex/auth.json/.codex/config.toml`: returned `0`.

Allowed grep findings:
- `0.0.0.0` appears only in warnings, tests for explicit opt-in behavior, historical docs, or the existing server LAN-url branch.
- `token`, `password`, and `secret` appear in existing auth/notification logic, test fixtures, and placeholder-only frp examples.
- `~/.codex/config.toml` appears in existing runtime/documentation references, not as a copied file or committed secret.

Blocked patterns:
- No `rm -rf`.
- No `git reset --hard`.
- No `git clean -fd`.
- No `chmod 777`.
- No frp binaries.
- No real frp token in examples.
- No real public IP/domain in frp examples.

## Round 3: Pre-push Final Review
- Date: 2026-05-04
- Status: Passed; push pending.

Commands and results:
- `npm run regression`: passed after commit `896a9c8`.
- `git status --short --branch`: branch `feature/intranet-access-frp-safe`, clean at the time of final verification.
- `git log --oneline --decorate -5`: confirmed staged branch commits on top of `origin/main`.
- `git merge-base HEAD main && git diff --stat main...HEAD`: confirmed expected branch diff.
- `git ls-files '*.js' ':!:public/vendor/*' | xargs -r -n 1 node --check`: passed.
- `bash -n scripts/frp/*.sh && bash scripts/frp/check-frp-config.sh deploy/frp/frps.example.toml deploy/frp/frpc.example.toml`: passed.
- `git grep` dangerous command scan: reviewed. Exact dangerous-command strings appear only in this security review and branch progress documentation, not in executable scripts.
- `git grep 0.0.0.0`: reviewed. Findings are warnings, explicit opt-in tests, historical docs, and existing explicit-bind server handling.
- secret-shaped scan for common `sk-`, `ghp_`, and Slack token formats: no hits.
- targeted `token/password/secret` scan: reviewed. Findings are placeholders, auth docs, test fixtures, or existing auth logic.
- `/tmp` Codex auth/config copy scan: returned `0`.

Residual risk:
- Existing code legitimately references `~/.codex/config.toml` for local Codex config reading. This branch did not add copying of that file and did not commit runtime credentials.
