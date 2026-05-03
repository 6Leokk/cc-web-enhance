# Built-in frp Design

## Objective
Make `cc-web-enhance` a simple intranet-access package: users configure a small set of `FRP_*` variables, run setup/download commands, and `npm start` can automatically launch the appropriate frp process without manual frp deployment.

## Current Baseline
- Branch: `feature/intranet-access-frp-safe`
- Checkpoint before this work: `fb3c0fe`
- Current safe bind behavior is already implemented via `lib/server-config.js`.
- Existing frp examples in `deploy/frp/` remain documentation examples and are not the final runtime config.
- Existing regression safety coverage lives in `scripts/intranet-frp-safety-regression.js`.

## Official Release Basis
The downloader uses GitHub's official `fatedier/frp` releases API. As of the design check, `/repos/fatedier/frp/releases/latest` returned `v0.68.1`, non-draft and non-prerelease, with assets such as `frp_0.68.1_linux_amd64.tar.gz` and an API `digest` field like `sha256:<hex>`.

## Runtime Directory
`frp/` is a generated runtime directory:

```text
frp/
  bin/        downloaded frpc/frps binaries and checksum.txt
  conf/       generated frpc.toml or frps.toml
  logs/       frpc.log / frps.log
  run/        pid files for npm run frp:* commands
```

The repository tracks only documentation/placeholders. Generated binaries, generated config, logs, pid files, and temporary archives stay ignored.

## Configuration Model
Environment variables are the source of truth. `.env` is loaded by existing startup code and the frp scripts use the same parsing approach.

Supported variables:
- `FRP_MODE`: `disabled`, `client`, or `server`. For startup auto-detect, empty means disabled unless another `FRP_*` value clearly requests frp.
- `FRP_SERVER_ADDR`
- `FRP_SERVER_PORT`
- `FRP_TOKEN`
- `FRP_TYPE`: `ip` or `domain`
- `FRP_LOCAL_IP`: default `127.0.0.1`
- `FRP_LOCAL_PORT`: default `8083`
- `FRP_PUBLIC_PORT`: required for client/ip mode
- `FRP_SUBDOMAIN`: optional for client/domain mode
- `FRP_CUSTOM_DOMAIN`: optional for client/domain mode
- `FRP_BIND_PORT`: server mode bind port, default `7000`
- `FRP_VHOST_HTTP_PORT`: optional server domain-mode HTTP vhost port
- `FRP_CONFIG_FILE`: optional override path
- `FRP_AUTO_START`: `1` to allow `server.js` auto-start; default disabled unless config file already exists and mode is not disabled.

No generated config in this branch contains a real token unless the user passes one through local environment. Committed templates use placeholders only.

## Config Generation
`lib/frp-config.js` parses the environment and renders TOML for:
- `frpc.toml` in client/ip mode
- `frpc.toml` in client/domain mode
- `frps.toml` in server mode

It preserves native frp extensibility by appending raw TOML from `FRP_EXTRA_TOML` or `FRP_EXTRA_TOML_FILE` after the generated minimal section. This gives users native frp power without expanding cc-web's schema.

## Binary Download
`scripts/frp-download.js`:
- detects `process.platform` and `process.arch`
- supports `--version` and `--arch`
- defaults to the latest stable official release
- downloads the matching release archive
- verifies SHA256 using the official GitHub release asset `digest`
- extracts `frpc` and `frps` into `frp/bin/`
- writes `frp/bin/checksum.txt`

SHA256 mismatch is a hard failure.

## Process Management
`lib/frp-manager.js` starts either `frpc` or `frps` based on resolved config:
- no detached child process
- stdout/stderr append to `frp/logs/<name>.log`
- pid recorded under `frp/run/`
- no automatic restart by default
- stop hooks on `SIGINT` and `SIGTERM`

`server.js` starts frp before `server.listen()` only when the internal gate allows auto-start:
- `FRP_MODE` is not `disabled`
- config path exists or local env clearly enables frp
- binary exists

If the binary is missing, cc-web remains available and logs an actionable message instead of downloading implicitly during startup.

## NPM UX
Scripts:
- `npm run frp:download`
- `npm run frp:setup`
- `npm run frp:start`
- `npm run frp:stop`
- `npm run frp:status`

User flow:
```bash
cp .env.example .env
# edit CC_WEB_* and FRP_* variables
npm run frp:download
npm run frp:setup
npm start
```

## Design Gate Result
Passed.

Checks:
- Existing `CC_WEB_HOST` / `CC_WEB_PORT` flow remains intact.
- IP and domain modes are supported.
- Native frp features remain available through appended TOML.
- Generated binaries/config are ignored.
- Startup auto-start is explicit and safe; missing binary does not break cc-web.
- Process management has stop hooks and pid cleanup.
