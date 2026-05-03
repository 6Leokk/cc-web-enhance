# CC-Web Enhance

A lightweight enhanced browser interface for Claude Code and Codex, designed to keep each agent close to its native CLI workflow while sharing the same web shell.

![Node.js](https://img.shields.io/badge/Node.js-22+-339933?logo=node.js&logoColor=white)
![License](https://img.shields.io/badge/License-See%20NOTICE-lightgrey)

[中文 README](./README.md) | [Notice](./NOTICE.md)

This repository is an enhanced derivative of [ZgDaniel/cc-web](https://github.com/ZgDaniel/cc-web). It keeps the original lightweight Claude Code / Codex web workflow and adds reliability, refresh performance, Codex rollout telemetry, static asset delivery, and regression coverage improvements.

## Source and License

- Upstream project: [`ZgDaniel/cc-web`](https://github.com/ZgDaniel/cc-web)
- Enhanced repository name: `cc-web-enhance`
- This repository preserves upstream source attribution and acknowledgements. See [NOTICE.md](./NOTICE.md).
- The upstream README displays an MIT badge, but GitHub license metadata currently does not expose a machine-readable upstream `LICENSE` file. This repository does not add a new license claim on top of upstream. Review and follow the latest upstream licensing statement before redistribution or derivative use.

## Screenshots

<p align="center">
  <img src="https://github.com/user-attachments/assets/ae974fcd-b6a7-4bdf-8553-bfcf2e7038a4" alt="Screenshot 1" width="30%" />
  <img src="https://github.com/user-attachments/assets/eb0291c1-2b38-4379-9a07-8eecc6c87d8f" alt="Screenshot 2" width="30%" />
  <img src="https://github.com/user-attachments/assets/09cec007-a949-44cf-9f2a-88c1eda60082" alt="Screenshot 3" width="30%" />
</p>

## Features

- **Lightweight runtime**: low backend overhead, browser-based control panel.
- **Dual-agent sessions**: create Claude or Codex sessions on the same backend core.
- **Agent-isolated views**: switching Claude / Codex only shows that agent's sessions, recent state, settings, and import entry points.
- **Agent-specific settings**: Claude keeps template-based model config; Codex has its own path, default model, mode, and search settings.
- **Multi-session management**: create, switch, rename, and delete sessions; deleting a session also removes the local Claude history record.
- **Local history import**: import Claude history from `~/.claude/projects/` and Codex rollout history from `~/.codex/sessions/`.
- **Session resume**: context continuity via `--resume`; you can also reattach via SSH + `tmux attach -t claude` when needed.
- **Background task support**: Claude processes continue after browser disconnect and notify you on completion.
- **Multi-channel notifications**: PushPlus / Telegram / ServerChan / Feishu bot / QQ (Qmsg) / Bark, configurable in Web UI.
- **Process persistence**: detached subprocess + PID files; running tasks survive service restarts.
- **Multi-API switching**: configure multiple API profiles and switch between them instantly from the UI.
- **Developer config**: save SSH host info (key/password auth) and GitHub tokens for quick remote host management and repository operations via `/ssh` and `/github` commands.
- **Password-based auth**: initial password generation, forced first-login reset, and password change in Web UI.
- **Enhanced reliability**: lazy session history, refresh caching, session-scoped events, Codex rollout parsing, and expanded regression coverage.

## Requirements

- **Node.js** >= 18
- **Claude Code CLI** and/or **Codex CLI** installed and configured

```bash
npm install -g @anthropic-ai/claude-code
npm install -g @openai/codex
```

## Quick Start

### Linux / macOS

```bash
git clone https://github.com/6Leokk/cc-web-enhance.git
cd cc-web-enhance
npm install
cp .env.example .env    # optional; if omitted, an initial password is auto-generated
npm start
```

### Windows

```cmd
git clone https://github.com/6Leokk/cc-web-enhance.git
cd cc-web-enhance
npm install
copy .env.example .env  & REM optional
```

Then run `start.bat`, or start manually with `node server.js`.

After startup, open `http://127.0.0.1:8083` and sign in with your password.

## Intranet Remote Access / frp Deployment

The service still listens only on `127.0.0.1:8083` by default. For safe public access to an intranet machine, use frp to forward the public entry to the local cc-web address instead of changing cc-web to a public bind by default.

This branch includes frp download, config generation, and process management, so you do not need to download frp manually:

```bash
cp .env.example .env
# Edit .env: set FRP_SERVER_ADDR, FRP_SERVER_PORT, FRP_TOKEN, and choose FRP_TYPE=ip or domain
npm run frp:download
npm run frp:setup
npm start
```

When `FRP_MODE=client` or `FRP_MODE=server`, `npm start` automatically starts the matching `frpc` or `frps` process. You can also manage it directly with `npm run frp:start`, `npm run frp:stop`, and `npm run frp:status`. Generated binaries, config, logs, and pid files live under `frp/`; `frp/bin/`, `frp/conf/`, `frp/logs/`, and `frp/run/` are ignored by git.

See [frp deployment](./docs/deploy-frp.md) for steps and [intranet access design](./docs/intranet-access-design.md) for architecture and alternatives.

## Configuration

### Environment Variables (.env)

| Variable | Required | Default | Description |
|------|:---:|--------|------|
| `CC_WEB_PASSWORD` | No | Auto-generated | Web login password (migrated into `config/auth.json` on first start) |
| `CC_WEB_PORT` | No | `8083` | Service port |
| `CC_WEB_HOST` | No | `127.0.0.1` | Bind address; keep default for frp mode |
| `PORT` | No | - | Legacy alias; `CC_WEB_PORT` takes priority |
| `HOST` | No | - | Legacy alias; `CC_WEB_HOST` takes priority |
| `FRP_MODE` | No | `disabled` | Built-in frp mode: `disabled` / `client` / `server` |
| `FRP_TYPE` | No | `ip` | Client tunnel type: public IP/port `ip`, or HTTP domain `domain` |
| `FRP_SERVER_ADDR` | Required for client | `YOUR_FRP_SERVER_IP` | Public frps address placeholder to replace locally |
| `FRP_SERVER_PORT` | No | `7000` | frps connection port |
| `FRP_TOKEN` | Required when frp is enabled | `YOUR_FRP_TOKEN` | Strong frp token; keep it only in local `.env` |
| `FRP_PUBLIC_PORT` | Required for `FRP_TYPE=ip` | `YOUR_PUBLIC_PORT` | Public TCP access port |
| `FRP_CUSTOM_DOMAIN` | Optional for `FRP_TYPE=domain` | `YOUR_DOMAIN` | Full domain for HTTP domain mode |
| `FRP_SUBDOMAIN` | No | - | frp subdomain for HTTP domain mode |
| `FRP_BIND_PORT` | Optional for server mode | `7000` | frps bindPort |
| `FRP_VHOST_HTTP_PORT` | Optional for server domain mode | - | frps HTTP vhost port |
| `FRP_LOCAL_IP` | No | `127.0.0.1` | Local address forwarded by frpc; keep the default for cc-web |
| `FRP_LOCAL_PORT` | No | `8083` | Local cc-web port forwarded by frpc |
| `FRP_AUTO_START` | No | `1` | Set `0` to prevent `npm start` from starting frp |
| `FRP_CONFIG_FILE` | No | `frp/conf/frpc.toml` or `frp/conf/frps.toml` | frp config path to generate/read |
| `FRP_EXTRA_TOML_FILE` | No | - | Local file containing native frp TOML to append |
| `CLAUDE_PATH` | No | `claude` | Executable path to Claude CLI |
| `CODEX_PATH` | No | `codex` | Executable path to Codex CLI |
| `PUSHPLUS_TOKEN` | No | - | PushPlus token (migrated into notification config on first start) |
| `BARK_DEVICE_KEY` | No | - | Bark Device Key (migrated into notification config on first start) |
| `BARK_SERVER_URL` | No | `https://api.day.app` | Bark server URL, including self-hosted servers |
| `BARK_GROUP` | No | `CC-Web` | Bark notification group |
| `BARK_LEVEL` | No | `active` | Bark notification level: `active` / `timeSensitive` / `passive` |
| `BARK_SOUND` | No | - | Bark sound name |
| `BARK_ICON` | No | - | Bark notification icon URL |
| `BARK_URL` | No | - | Bark notification click URL |

`.env` is already ignored by `.gitignore` and will not be uploaded to GitHub. Do not put real tokens in `.env.example` or README files.

### Notification Configuration

Open the **Settings (⚙)** button in the sidebar to configure notifications in Web UI.

| Channel | Required Fields | How to Get |
|---------|---------|---------|
| **PushPlus** | Token | Register at [pushplus.plus](https://www.pushplus.plus/) |
| **Telegram** | Bot Token + Chat ID | Create bot via [@BotFather](https://t.me/BotFather) |
| **ServerChan** | SendKey | Register at [sct.ftqq.com](https://sct.ftqq.com/) |
| **Feishu Bot** | Webhook URL | Feishu group → Settings → Group Bot |
| **QQ (Qmsg)** | Qmsg Key | Obtain from [qmsg.zendee.cn](https://qmsg.zendee.cn/) |
| **Bark** (iOS) | Server URL + Device Key | Copy the key from the Bark iOS app; defaults to `https://api.day.app` and also supports self-hosted servers |

Settings are stored in `config/notify.json`. Tokens are masked in UI display.

### Password Management

Passwords are stored in `config/auth.json` and support generation + UI updates:

- **First startup** (no password in `.env` and no `auth.json`): auto-generates a random 12-character password, prints it to console, and requires password reset on first login.
- **Migration from `.env`**: if `CC_WEB_PASSWORD` is already set, it is migrated to `auth.json` automatically at startup.
- **Change password in UI**: Settings panel → Change Password (requires current password).
- **Password policy**: at least 8 characters, with at least 2 of these categories: uppercase, lowercase, number, special character.
- **After password change**: all existing logged-in sessions are invalidated.

## Project Structure

```text
cc-web/
├── server.js              # Node.js backend (HTTP + WebSocket + process management + notifications)
├── lib/
│   ├── agent-runtime.js    # Claude / Codex runtime adapter
│   ├── codex-rollouts.js   # Codex rollout history parser
│   ├── frp-config.js       # Built-in frp config generation
│   └── frp-manager.js      # Built-in frp process management
├── frp/                    # frp runtime directory (bin/conf/logs/run are generated and ignored)
├── public/
│   ├── index.html          # UI structure
│   ├── app.js              # Frontend logic (WebSocket, UI interactions)
│   ├── style.css           # Styles
│   └── sw.js               # Service Worker (mobile notifications)
├── config/
│   ├── codex.json          # Codex isolated config (generated at runtime)
│   ├── notify.json         # Notification channel config (generated at runtime)
│   └── auth.json           # Auth config (generated at runtime)
├── sessions/               # Chat history JSON files (generated at runtime)
├── logs/                   # Process lifecycle logs (generated at runtime)
├── scripts/                # Regression tooling, mock CLIs, and frp helper commands
├── .env.example            # Environment variable template
├── start.bat               # Windows startup script
├── .gitignore
├── package.json
└── README.md
```

## Architecture

### Process Model

```text
Browser ←WebSocket→ Node.js (server.js) ←file I/O→ Claude / Codex CLI (detached)
```

- Each user message spawns either a Claude or Codex subprocess depending on the session agent.
- Subprocesses use `detached: true` + `proc.unref()` and run independently from Node.js lifecycle.
- stdin/stdout/stderr are bridged via files in `sessions/{id}-run/`.
- PID is persisted to disk and recovered after service restart (`recoverProcesses()`).
- `FileTailer` streams file updates to frontend in real time.

### Background Task Flow

1. User sends a message → spawn Claude subprocess.
2. User closes browser → subprocess keeps running.
3. Process completes → PID monitor detects exit.
4. Completion notification is sent.
5. User reconnects → completed response is synced.

### Process Logs

`logs/process.log` uses JSONL format with automatic 2MB rotation.

| Event | Description |
|------|------|
| `process_spawn` | Process created (PID, mode, model) |
| `process_complete` | Process finished (exit code, duration, cost) |
| `ws_connect` / `ws_disconnect` | Client connected/disconnected |
| `ws_resume_attach` | Client reconnected to running process |
| `recovery_alive` / `recovery_dead` | Process recovery during service restart |
| `heartbeat` | Active process snapshot every 60 seconds |

View logs:

```bash
tail -f logs/process.log | jq .
```

## Production Deployment

Run verification before deployment:

```bash
npm run regression
npm run regression:ui
```

Security notes:

- Do not commit `.env`, `config/`, `sessions/`, `logs/`, `attachments/`, `.npmrc`, or private key files.
- The default bind address is `127.0.0.1:8083`. For remote access, prefer frp, Tailscale, Cloudflare Tunnel, or an Nginx reverse proxy with restricted source IPs.
- Do not directly expose cc-web with `0.0.0.0` by default. If explicitly configured, use a strong password and firewall rules that allow only trusted devices.

### systemd Service

Create `/etc/systemd/system/cc-web-enhance.service`:

```ini
[Unit]
Description=CC-Web Enhance - Claude Code / Codex Web UI
After=network.target

[Service]
Type=simple
User=your-user
WorkingDirectory=/path/to/cc-web-enhance
ExecStart=/usr/bin/node server.js
Restart=on-failure
RestartSec=5
# Important: only stop Node.js process, not Claude child processes
KillMode=process

[Install]
WantedBy=multi-user.target
```

`KillMode=process` is important. It ensures systemd restart only stops Node.js, while Claude subprocesses continue and are reattached after recovery.

```bash
sudo systemctl daemon-reload
sudo systemctl enable cc-web-enhance
sudo systemctl start cc-web-enhance
sudo systemctl status cc-web-enhance --no-pager -l
```

### Nginx Reverse Proxy

```nginx
server {
    listen 443 ssl;
    server_name your-domain.com;

    ssl_certificate     /path/to/fullchain.pem;
    ssl_certificate_key /path/to/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:8083;
        proxy_http_version 1.1;

        # WebSocket support
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;

        # Long-running tasks may take time
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }
}
```

### Windows Deployment

Use this mode when running CC-Web on a personal PC and controlling Claude / Codex from mobile.

Start with `start.bat`, or run manually:

```cmd
cd cc-web-enhance
npm install
node server.js
```

**LAN access** (same Wi-Fi):
- For security, CC-Web listens on `127.0.0.1` by default. Prefer exposing it through a reverse proxy such as Nginx, or through Tailscale / Cloudflare Tunnel, with firewall rules limiting who can connect.
- If LAN access is required, explicitly set `CC_WEB_HOST=0.0.0.0`, but the recommended remote-access path is to keep `127.0.0.1:8083` and follow [frp deployment](./docs/deploy-frp.md).

**Remote access**:
- Recommended: the frp path in [frp deployment](./docs/deploy-frp.md), or controlled tunnel options such as Tailscale / Cloudflare Tunnel.

## Release Notes

- **v1.3.0**
  - **Developer settings**: SSH host management (key/password auth) with `/ssh` command; GitHub token & repo management with `/github` command
  - **Unified settings panel**: Claude and Codex API configs now in one panel
  - **Local config templates**: read/snapshot/restore local API config with "本地配置" template
  - **New session redesign**: local/remote task selection, pinned directories, SSH remote host connection

- **v1.2.10**
  - Implemented `/init` behavior aligned with native Claude Code and Codex CLI

- **v1.2.8**
  - **Dual-agent (Codex)**: create Claude or Codex sessions on the same backend; agent-isolated sidebar, settings, and import
  - **Image upload**: drag, paste, or attach images in both Claude and Codex sessions; client-side WebP compression, 7-day server cache, up to 4 images per message
  - **Session loading**: loading overlay, hot session cache (4 slots, strong/weak hit), fix for streaming content disappearing on tab switch
  - **Theme system**: full theme engine with CoolVibe Light, washi, and editorial variants; theme picker moved to sub-page
  - **Mobile UX**: swipe-to-open/close sidebar, running-state badge replaces cwd label, button sizing fixes
  - **Backend refactor**: spawn spec + event parsing extracted to `lib/agent-runtime.js`; isolated regression script `npm run regression`

- **v1.2.2**
  - Aligned context compression with Claude Code native behavior: `/compact` is now actually sent to CLI instead of doing a local pseudo-reset.
  - Added automatic overflow recovery: when `Request too large (max 20MB)` occurs, CC-Web runs `/compact` and replays the failed prompt automatically.
  - Added retry guard: if context is still too large after compacting, CC-Web stops auto-retry and asks for a narrower prompt range.
- **v1.2.1**
  - Fixed missing `AskUserQuestion` options in Web UI by preserving structured tool input in backend and rendering question/option cards on frontend.
  - Added option-to-input shortcut: click an option to append it into the input box for quick confirmation.
- **v1.2**
  - Fixed layout overflow caused by long code blocks in messages. The page no longer stretches horizontally; code blocks scroll within the block.
  - Improved mobile input behavior: Enter inserts newline by default, and sending is done via the send button.
- **v1.1**
  - Added compatibility improvements for Claude Code CLI on Windows.

## Notes

- Claude support is still the more mature path, while Codex now supports isolated sessions, resume, import, background execution, and local cleanup.
