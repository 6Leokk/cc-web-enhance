# CC-Web Enhance

A browser-based remote control panel for Claude Code and Codex CLI. It keeps the local CLI-agent workflow, then adds a lightweight web workspace for sessions, history, background tasks, notifications, and controlled remote access.

![Node.js](https://img.shields.io/badge/Node.js-18+-339933?logo=node.js&logoColor=white)
![License](https://img.shields.io/badge/License-See%20NOTICE-lightgrey)

[中文 README](./README.md) | [Changelog](./CHANGELOG.md) | [Notice](./NOTICE.md)

## Not a Rebranded Upstream README

This repository is an enhanced fork of [`ZgDaniel/cc-web`](https://github.com/ZgDaniel/cc-web). The enhanced repository is [`6Leokk/cc-web-enhance`](https://github.com/6Leokk/cc-web-enhance). This README describes the current enhanced project instead of reusing the upstream README structure.

The enhanced version focuses on:

- Claude Code and Codex CLI in one web workspace
- more reliable session switching, refresh recovery, background tasks, and history import
- local-only defaults with explicit remote-access modes
- ngrok, frp, public-host, and LAN access paths
- mainland China deployment scripts that do not mutate host npm configuration
- regression coverage for sessions, access modes, static delivery, Codex rollout parsing, and related flows

## Who It Is For

- users who want to control local Claude Code / Codex from a browser or phone
- users who want long-running tasks to continue after the browser closes
- users who need the same tool on a local machine, LAN, VPS, or NAT-only host
- developers who want a remote web entry point while keeping CLI-agent behavior

## Mainland China One-Command Install

Prerequisites: `git`, `Node.js >= 18`, and `npm` are already installed. The script does not install system packages and does not run `npm config set`.

Install and start:

```bash
curl -fsSL https://raw.githubusercontent.com/6Leokk/cc-web-enhance/main/scripts/install-cn.sh | bash -s -- --start
```

If raw.githubusercontent.com is unstable:

```bash
curl -fsSL https://gh-proxy.com/https://raw.githubusercontent.com/6Leokk/cc-web-enhance/main/scripts/install-cn.sh | bash -s -- --start
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

The bootstrap installer is `scripts/install-cn.sh`. It checks out this repository, then delegates dependency setup to `scripts/deploy/linux-cn.sh`. The mainland preset installs dependencies with a per-command registry flag equivalent to:

```bash
npm install --registry=https://registry.npmmirror.com
```

It defaults to `--reset`, removing `node_modules`, `frp/bin`, and `frp/tmp` before reinstalling. It does not remove `.env`, `config/`, `sessions/`, `logs/`, or `frp/conf/`. To keep existing install artifacts:

```bash
bash scripts/deploy/linux-cn.sh --no-reset
```

Windows users can run this inside the repository:

```cmd
scripts\deploy\windows-cn.cmd
```

## Manual Install

Linux / macOS:

```bash
git clone https://github.com/6Leokk/cc-web-enhance.git
cd cc-web-enhance
npm install
cp .env.example .env
npm start
```

Windows:

```cmd
git clone https://github.com/6Leokk/cc-web-enhance.git
cd cc-web-enhance
npm install
copy .env.example .env
node server.js
```

Open after startup:

```text
http://127.0.0.1:8083
```

If no password is configured, the server prints a random initial password and requires a password change after first login.

## Remote Access Choices

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
npm run deploy:cn         # Mainland deployment preset
npm run deploy:global     # Global deployment preset
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
- [docs/security/intranet-access-threat-model.md](./docs/security/intranet-access-threat-model.md): threat model
- [docs/security/intranet-access-security-review.md](./docs/security/intranet-access-security-review.md): security review notes
- [CHANGELOG.md](./CHANGELOG.md): release history
- [NOTICE.md](./NOTICE.md): upstream and license status

## Source and License

This project is an enhanced fork of [`ZgDaniel/cc-web`](https://github.com/ZgDaniel/cc-web). It preserves upstream attribution and Git history, and records license status in [NOTICE.md](./NOTICE.md).

The upstream README has displayed an MIT badge, but the upstream repository currently does not expose a machine-readable `LICENSE` file. This repository does not add a new license claim on top of upstream. Review the latest upstream license statement before redistribution, derivative use, or commercial use.
