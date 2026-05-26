# CC-Web Enhance

Browser web console for Claude Code / Codex CLI. Background tasks, history import, remote access (frp / ngrok). Local-only by default on `127.0.0.1:8083`.

![Node.js](https://img.shields.io/badge/Node.js-18+-339933?logo=node.js&logoColor=white)
![License](https://img.shields.io/badge/License-MIT%20/%20See%20NOTICE-blue)

[中文](./README.md) | [Changelog](./CHANGELOG.md) | [Notice](./NOTICE.md)

## One-Command Install

Prerequisites: `git`, `Node.js >= 18`, `npm`.

### Windows

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -Command "& ([scriptblock]::Create((irm 'https://raw.githubusercontent.com/6Leokk/cc-web-enhance/main/scripts/install-cn.ps1?v=2'))) -Start"
```

<details>
<summary>Network issues? Use mirror proxy command</summary>

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -Command "`$s=try{irm 'https://raw.githubusercontent.com/6Leokk/cc-web-enhance/main/scripts/install-cn.ps1?v=2' -TimeoutSec 15}catch{irm 'https://gh-proxy.com/https://raw.githubusercontent.com/6Leokk/cc-web-enhance/main/scripts/install-cn.ps1?v=2' -TimeoutSec 15}; & ([scriptblock]::Create(`$s)) -Start"
```
</details>

### Linux / macOS

```bash
curl -fsSL https://raw.githubusercontent.com/6Leokk/cc-web-enhance/main/scripts/install-cn.sh?v=2 | bash -s -- --start
```

<details>
<summary>Network issues? Use mirror proxy command</summary>

```bash
(curl -fsSL --connect-timeout 15 https://raw.githubusercontent.com/6Leokk/cc-web-enhance/main/scripts/install-cn.sh?v=2 || curl -fsSL https://gh-proxy.com/https://raw.githubusercontent.com/6Leokk/cc-web-enhance/main/scripts/install-cn.sh?v=2) | bash -s -- --start
```
</details>

### One-command deploy with ngrok

```bash
# Linux — ngrok + custom password (omit --password to auto-generate)
curl -fsSL ...install-cn.sh?v=2 | bash -s -- --start --token <ngrok-token> --password <password>
```

```powershell
# Windows
powershell ... -Token <ngrok-token> -Password <password> -Start
```

> The install script auto-falls-back to gh-proxy and npmmirror npm mirror. No manual mirror config needed.

Installs to: Windows `%LOCALAPPDATA%\cc-web-enhance`, Linux/macOS `/opt/cc-web-enhance` (requires sudo; custom path: `CC_WEB_INSTALL_DIR=/path bash`).
The server starts automatically — open `http://127.0.0.1:8083` in your browser.

## Reset Configuration

Delete `.env` and rerun the setup wizard (switch access mode, ngrok token, etc.):

```bash
# Linux / macOS
rm -f /opt/cc-web-enhance/.env && cd /opt/cc-web-enhance && npm run reconfigure

# Windows
Remove-Item -Force "$env:LOCALAPPDATA\cc-web-enhance\.env" -ErrorAction SilentlyContinue
cd "$env:LOCALAPPDATA\cc-web-enhance"
npm run reconfigure
```

You can also run `npm run reconfigure` directly without deleting `.env`.

## Common Commands

```bash
npm start                 # Start server
npm run reconfigure       # Interactive reconfiguration (access mode, ngrok, etc.)
npm run start:ngrok       # One-shot ngrok setup + launch
npm run frp:download      # Download frp binaries
npm run frp:setup         # Render frp config
npm run regression        # Run regression tests
```

## Key Features

- **Multi-Agent** — Claude Code and Codex CLI in one workspace
- **Background Tasks** — Keep running after closing the browser; refresh to resume
- **Remote Access** — frp / ngrok tunnels, LAN sharing; local-only by default
- **Secure Defaults** — Binds 127.0.0.1 only; password auth, IP whitelist
- **Mobile Friendly** — Responsive UI

## Documentation

| Topic | Link |
|-------|------|
| Configuration | [docs/configuration.md](./docs/configuration.md) |
| Remote Access | [docs/remote-access.md](./docs/remote-access.md) |
| Architecture | [docs/architecture.md](./docs/architecture.md) |
| Development | [docs/development.md](./docs/development.md) |
| WebSocket Protocol | [docs/websocket-protocol.md](./docs/websocket-protocol.md) |
| frp Deployment | [docs/deploy-frp.md](./docs/deploy-frp.md) |
| Telemetry | [docs/testing-usage-telemetry.md](./docs/testing-usage-telemetry.md) |

## License

Enhanced fork of [ZgDaniel/cc-web](https://github.com/ZgDaniel/cc-web). See [NOTICE.md](./NOTICE.md).
