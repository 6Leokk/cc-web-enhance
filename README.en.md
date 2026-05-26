# CC-Web Enhance

A browser remote control panel for Claude Code / Codex CLI. It wraps local CLI agents in a lightweight web workspace so you can create sessions, resume work, view history, and let long tasks keep running after the browser is closed.

![Node.js](https://img.shields.io/badge/Node.js-18+-339933?logo=node.js&logoColor=white)
![License](https://img.shields.io/badge/License-See%20NOTICE-lightgrey)

[中文 README](./README.md) | [Changelog](./CHANGELOG.md) | [Notice](./NOTICE.md)

## Start Here

| Your situation | Read this first |
|----------------|-----------------|
| Windows, and you want to install directly from GitHub | [Windows One-Command Install](#windows-one-command-install) |
| You already cloned the repo on Windows | [Windows With An Existing Clone](#windows-with-an-existing-clone) |
| Linux / macOS / VPS, and you want to install from GitHub | [Linux / macOS One-Command Install](#linux--macos-one-command-install) |
| You want phone, LAN, ngrok, or frp remote access | [Remote Access](#remote-access) |
| You only need command names | [Common Commands](#common-commands) |

## What This Is

This project is an enhanced fork of [`ZgDaniel/cc-web`](https://github.com/ZgDaniel/cc-web). It keeps the native CLI-agent workflow, then adds clearer web sessions, controlled remote access, and regression coverage.

It mainly provides:

- Claude Code and Codex CLI in one web workspace
- session switching, refresh recovery, background tasks, and history import
- local-only defaults, with remote access enabled only when you choose it
- ngrok, frp, public server, and LAN access modes
- mainland China deployment scripts that do not mutate host npm configuration

## Windows One-Command Install

Prerequisites: `git`, `Node.js >= 18`, and `npm` are already installed. The installer does not install system packages and does not run `npm config set`.

Run this in PowerShell:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -Command "& ([scriptblock]::Create((irm 'https://raw.githubusercontent.com/6Leokk/cc-web-enhance/main/scripts/install-cn.ps1?v=2'))) -Start"
```

If raw.githubusercontent.com is unstable, use the proxy fallback (auto-timeout):

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -Command "`$s=try{irm 'https://raw.githubusercontent.com/6Leokk/cc-web-enhance/main/scripts/install-cn.ps1?v=2' -TimeoutSec 15}catch{irm 'https://gh-proxy.com/https://raw.githubusercontent.com/6Leokk/cc-web-enhance/main/scripts/install-cn.ps1?v=2' -TimeoutSec 15}; & ([scriptblock]::Create(`$s)) -Start"
```

Default install directory:

```text
$env:LOCALAPPDATA\cc-web-enhance
```

Use another install directory:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -Command "& ([scriptblock]::Create((irm 'https://raw.githubusercontent.com/6Leokk/cc-web-enhance/main/scripts/install-cn.ps1?v=2'))) -InstallDir D:\cc-web-enhance -Start"
```

Install without starting:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -Command "& ([scriptblock]::Create((irm 'https://raw.githubusercontent.com/6Leokk/cc-web-enhance/main/scripts/install-cn.ps1?v=2')))"
cd "$env:LOCALAPPDATA\cc-web-enhance"
npm start
```

Prepare built-in frp during installation:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -Command "& ([scriptblock]::Create((irm 'https://raw.githubusercontent.com/6Leokk/cc-web-enhance/main/scripts/install-cn.ps1'))) -WithFrp"
```

The bootstrap installer `scripts/install-cn.ps1` checks out or updates this repository, then delegates dependency setup to `scripts\deploy\windows-cn.cmd`. It reinstalls dependencies by default. To keep existing `node_modules` and frp download cache:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -Command "& ([scriptblock]::Create((irm 'https://raw.githubusercontent.com/6Leokk/cc-web-enhance/main/scripts/install-cn.ps1'))) -NoReset -Start"
```

Only run remote PowerShell scripts from repositories you trust. If you want to inspect it first, read `scripts/install-cn.ps1` before running it.

## Windows With An Existing Clone

If you have already cloned the repository on Windows, run the repository-local wrapper:

```cmd
git clone https://github.com/6Leokk/cc-web-enhance.git
cd cc-web-enhance
scripts\deploy\windows-cn.cmd
npm start
```

Open after startup:

```text
http://127.0.0.1:8083
```

If no password is configured, the server prints a random initial password and requires a password change after first login.

## Linux / macOS One-Command Install

Prerequisites: `git`, `Node.js >= 18`, and `npm` are already installed. The installer does not install system packages and does not run `npm config set`.

Install and start:

```bash
curl -fsSL https://raw.githubusercontent.com/6Leokk/cc-web-enhance/main/scripts/install-cn.sh | bash -s -- --start
```

If raw.githubusercontent.com is unstable, use the proxy fallback (auto-timeout):

```bash
(curl -fsSL --connect-timeout 15 https://raw.githubusercontent.com/6Leokk/cc-web-enhance/main/scripts/install-cn.sh || curl -fsSL https://gh-proxy.com/https://raw.githubusercontent.com/6Leokk/cc-web-enhance/main/scripts/install-cn.sh) | bash -s -- --start
```

Default install directory:

```text
/opt/cc-web-enhance
```

Directory layout:

```text
/opt/cc-web-enhance/          repository checkout
/opt/cc-web-enhance/.env      local environment config, never committed
/opt/cc-web-enhance/config/   auth, notification, Codex, and runtime config
/opt/cc-web-enhance/sessions/ session records
/opt/cc-web-enhance/logs/     runtime logs
/opt/cc-web-enhance/frp/      frp binaries, config, logs, and pid files
```

Use another install directory:

```bash
curl -fsSL https://raw.githubusercontent.com/6Leokk/cc-web-enhance/main/scripts/install-cn.sh | CC_WEB_INSTALL_DIR=/data/cc-web-enhance bash -s -- --start
```

Install without starting:

```bash
curl -fsSL https://raw.githubusercontent.com/6Leokk/cc-web-enhance/main/scripts/install-cn.sh | bash
cd /opt/cc-web-enhance
npm start
```

Prepare built-in frp during installation:

```bash
curl -fsSL https://raw.githubusercontent.com/6Leokk/cc-web-enhance/main/scripts/install-cn.sh | bash -s -- --with-frp
```

The bootstrap installer `scripts/install-cn.sh` checks out or updates this repository, then delegates dependency setup to `scripts/deploy/linux-cn.sh`. The mainland preset installs dependencies with a per-command registry flag equivalent to:

```bash
npm install --registry=https://registry.npmmirror.com
```

It defaults to `--reset`, removing `node_modules`, `frp/bin`, and `frp/tmp` before reinstalling. It does not remove `.env`, `config/`, `sessions/`, `logs/`, or `frp/conf/`. To keep existing install artifacts:

```bash
bash scripts/deploy/linux-cn.sh --no-reset
```

## Remote Access

The default mode is local-only: `CC_WEB_ACCESS_MODE=direct` + `CC_WEB_DIRECT_SCOPE=local`, bound to `127.0.0.1:8083`.

| Scenario | Recommended mode | Notes |
|----------|------------------|-------|
| Same-machine browser access | default direct/local | No extra setup |
| Phone on the same LAN | direct/lan | Trusted Wi-Fi / LAN only |
| Remote access without public IP | ngrok | Fastest path for personal use |
| Existing VPS / frps | frp | Advanced self-hosted path |
| Public server deployment | public | Use HTTPS reverse proxy and firewall rules |

Fast ngrok start:

```bash
npm run start:ngrok
```

Command-line ngrok setup:

```bash
npm run start:ngrok -- --token YOUR_NGROK_AUTHTOKEN
npm run start:ngrok -- --token YOUR_NGROK_AUTHTOKEN --domain YOUR_DOMAIN
npm run start:ngrok -- --token YOUR_NGROK_AUTHTOKEN --basic-auth user:pass
```

Self-hosted frp path:

```bash
cp .env.example .env
# Edit .env: set CC_WEB_ACCESS_MODE=frp and fill FRP_* variables
npm run frp:download
npm run frp:setup
npm start
```

Built-in frp runtime files live under `frp/bin/`, `frp/conf/`, `frp/logs/`, `frp/run/`, and `frp/tmp/`. `frp/conf/` may contain real tokens and must not be committed.

See [docs/deploy-frp.md](./docs/deploy-frp.md) for the full frp guide.

## Common Commands

```bash
npm start                 # Start cc-web
npm run start:ngrok       # Configure and start ngrok mode
npm run setup:ngrok       # Write ngrok config only
npm run deploy:cn         # Mainland dependency install preset
npm run deploy:global     # Global dependency install preset
npm run frp:download      # Download and verify frp
npm run frp:setup         # Generate frp config
npm run frp:start         # Start frp
npm run frp:stop          # Stop frp
npm run regression        # Run regression checks
```

## Security Boundaries

- Default bind is `127.0.0.1:8083`
- Do not commit `.env`, `config/`, `sessions/`, `logs/`, or `frp/conf/`
- Do not put real tokens, cookies, sessions, private keys, or secrets in README or `.env.example`
- Public access should use HTTPS, strong passwords, firewall rules, IP allowlists, or reverse-proxy access control
- Avoid directly exposing `0.0.0.0:8083` to the public internet
- Set `CC_WEB_TRUST_PROXY=1` only behind a trusted reverse proxy
- Quick login uses `/#pair=` fragments, not query strings

## Documentation

- [docs/deploy-frp.md](./docs/deploy-frp.md): self-hosted frp deployment
- [docs/intranet-access-design.md](./docs/intranet-access-design.md): access-mode design
- [docs/testing-usage-telemetry.md](./docs/testing-usage-telemetry.md): Claude / Codex usage telemetry testing guide
- [docs/security/intranet-access-threat-model.md](./docs/security/intranet-access-threat-model.md): threat model
- [docs/security/intranet-access-security-review.md](./docs/security/intranet-access-security-review.md): security review notes
- [CHANGELOG.md](./CHANGELOG.md): release history
- [NOTICE.md](./NOTICE.md): upstream and license status

## Source and License

This project is an enhanced fork of [`ZgDaniel/cc-web`](https://github.com/ZgDaniel/cc-web). It preserves upstream attribution and Git history, and records license status in [NOTICE.md](./NOTICE.md).

The upstream README has displayed an MIT badge, but the upstream repository currently does not expose a machine-readable `LICENSE` file. This repository does not add a new license claim on top of upstream. Review the latest upstream license statement before redistribution, derivative use, or commercial use.
