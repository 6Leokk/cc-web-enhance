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
- Status: Pending.
- Required before push:
  - Re-run final verification commands.
  - Inspect `git diff`, `git status`, and `git log --oneline`.
  - Confirm docs and branch progress are complete.
