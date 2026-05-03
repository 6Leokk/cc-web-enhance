# Built-in frp Implementation Plan

## Goal
Add built-in frp binary download, config generation, process management, startup integration, and user-facing npm commands while preserving the existing safe bind and regression suite.

## Checkpoint
- Baseline checkpoint: `fb3c0fe`
- `git push origin HEAD`: completed, `Everything up-to-date`

## Slice 1: Documentation and Internal Gates
Files:
- Create `docs/superpowers/specs/2026-05-04-frp-builtin-design.md`
- Create `docs/superpowers/plans/2026-05-04-frp-builtin-implementation.md`
- Create `docs/superpowers/progress/2026-05-04-frp-builtin-progress.md`

Acceptance:
- Design gate passes internally.
- Plan gate passes internally.
- Progress file records checkpoint and gate outcome.

## Slice 2: Binary Download and SHA256 Verification
Files:
- Create `scripts/frp-download.js`
- Modify `.gitignore`
- Create or update `frp/README.md`
- Modify `package.json`

Acceptance:
- `npm run frp:download` downloads official frp archive for current platform.
- SHA256 is verified against GitHub release asset `digest`.
- `frp/bin/frpc` and `frp/bin/frps` exist after download.
- `frp/bin/checksum.txt` records version, asset, URL, and SHA256.
- `frp/bin` is not tracked by git.

## Slice 3: Config Rendering and Setup
Files:
- Create `lib/frp-config.js`
- Create `scripts/frp-setup.js`
- Create `scripts/frp-builtin-regression.js`
- Modify `package.json`
- Modify `.env.example`
- Modify `.gitignore`

Acceptance:
- Unit-style regression covers client/ip, client/domain, and server mode TOML.
- Generated config writes to `frp/conf/frpc.toml` or `frp/conf/frps.toml`.
- Generated config is ignored by git.
- Real token is never committed.

## Slice 4: Process Manager and CLI Control
Files:
- Create `lib/frp-manager.js`
- Create `scripts/frp-control.js`
- Modify `package.json`

Acceptance:
- `npm run frp:start` starts configured frp.
- `npm run frp:stop` stops only the tracked pid.
- `npm run frp:status` reports state without side effects.
- Logs go to `frp/logs/`.
- PID files go to `frp/run/`.

## Slice 5: server.js Startup Integration
Files:
- Modify `server.js`
- Modify `scripts/frp-builtin-regression.js`

Acceptance:
- `server.js` uses `frp-manager.startFromEnv()` before `server.listen()`.
- Missing binary/config does not crash cc-web.
- `shutdown()` calls frp manager stop before exiting.
- Existing `CC_WEB_HOST` / `CC_WEB_PORT` behavior remains unchanged.

## Slice 6: User Docs and Final Verification
Files:
- Modify `README.md`
- Modify `README.en.md`
- Modify `docs/intranet-access-design.md`
- Modify `docs/superpowers/progress/2026-05-04-frp-builtin-progress.md`

Acceptance:
- README describes the clone -> `.env` -> `frp:download` -> `frp:setup` -> `npm start` flow.
- `docs/intranet-access-design.md` adds built-in frp behavior without removing existing architecture notes.
- `npm run regression` passes.
- `node --check` passes for all added/modified JS.
- `bash -n` passes for shell scripts.
- `git diff --check` passes.
- `git status --short` is clean after final commit and push.

## Plan Gate Result
Passed.

Reasoning:
- Slices are independently testable.
- Existing server startup is touched only at the frp manager integration point.
- Binary/config/log/runtime files are explicitly ignored.
- The existing regression suite is extended rather than modified destructively.
