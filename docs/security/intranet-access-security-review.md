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

## Round 4: Built-in frp Final Review
- Date: 2026-05-04
- Status: Passed; final push pending.

Scope:
- Built-in frp binary download and SHA256 verification.
- Generated config and process manager.
- `server.js` auto-start integration.
- README, deployment docs, `.env.example`, and progress docs.

Commands and results:
- `npm run frp:download`: passed; downloaded official `v0.68.1` asset `frp_0.68.1_linux_amd64.tar.gz`.
- Verified SHA256: `4a4e88987d39561e1b3b3b23d0ede48a457eebf76a87231999957e870f5f02b6`.
- `frp/bin/frpc -v && frp/bin/frps -v`: both returned `0.68.1`.
- `npm run regression`: passed, including `scripts/intranet-frp-safety-regression.js` and `scripts/frp-builtin-regression.js`.
- `git ls-files '*.js' ':!:public/vendor/*' | xargs -r -n 1 node --check`: passed.
- `bash -n scripts/frp/check-frp-config.sh && bash -n scripts/frp/check-local-cc-web.sh`: passed.
- `git diff --check`: passed.
- `git ls-files frp/bin frp/conf frp/logs frp/run frp/tmp`: no tracked files.
- `ps -ef | grep -E 'frpc|frps' | grep -v grep || true`: no lingering frp process.
- Tracked-only dangerous command scan outside docs/archive: no hits for `rm -rf`, `git reset --hard`, `git clean -fd`, or `chmod 777`.
- Common secret-shaped scan: no hits.
- Dashboard scan: only regression assertion confirming dashboard is not enabled by default.

Allowed findings:
- `0.0.0.0` appears in warnings, explicit opt-in tests, historical archived notes, and existing explicit-bind handling; default remains `127.0.0.1:8083`.
- `token`, `password`, and `secret` findings are existing auth logic, test fixtures, placeholder `YOUR_*` values, or safety documentation.
- Existing `~/.codex/config.toml` references remain local runtime references; this work did not add copying or committing Codex auth/config files.

Residual risk:
- Generated local `frp/conf/*.toml` may contain a real token after user setup. The path is ignored by git and must stay out of commits.
