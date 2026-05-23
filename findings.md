# Findings & Decisions

## Requirements
- Record the proposed built-in ngrok design before implementation.
- Account for three broad deployment classes:
  - Direct browser-access users who only need same-machine or same-network access.
  - Intranet hosts that need tunneling through frp or ngrok.
  - Public hosts that can expose `cc-web-enhance` directly or through a reverse proxy.
- Run an init scan of the current project before making deeper design decisions.
- Evaluate whether the current implementation language/runtime is still the best fit.
- Preserve a highly integrated, small-user-friendly experience.

## Project Scan Findings
- Current branch: `feature/intranet-access-frp-safe`.
- Project name in `package.json`: `cc-web-enhance`.
- Runtime is a pure Node.js/CommonJS application with no frontend build pipeline.
- Main runtime files:
  - `server.js`: HTTP/WebSocket server, auth, session/process management, static serving, notification, CLI agent orchestration.
  - `public/app.js`: browser UI and WebSocket client.
  - `lib/server-config.js`: resolves `CC_WEB_HOST` / `CC_WEB_PORT` with legacy `HOST` / `PORT` fallback.
  - `lib/frp-config.js`: resolves `FRP_*` environment and renders frp TOML.
  - `lib/frp-manager.js`: starts/stops/status-checks managed `frpc` / `frps`.
  - `scripts/frp-download.js`: downloads official frp release assets and installs `frpc` / `frps`.
- Existing default bind is local-only: `127.0.0.1:8083`.
- Public-host direct access is already technically possible through `CC_WEB_HOST=0.0.0.0` and `CC_WEB_PORT`, but it is not currently presented as a first-class deployment mode.
- Existing frp integration is deeper than documentation:
  - `.env.example` includes `FRP_*` variables.
  - `package.json` exposes `frp:download`, `frp:setup`, `frp:start`, `frp:stop`, `frp:status`.
  - `server.js` calls `startFrpFromEnv()` before `server.listen()`.
  - shutdown calls `stopFrpHandle()` for managed frp cleanup.
- Existing UI already has a settings subpage pattern and WebSocket request/response messages for persisted config, making a future "Remote Access" settings page consistent with local patterns.
- Dependency surface is intentionally small: `npm ls --depth=0` reports only `ws@8.19.0` as an application dependency.
- Local tool versions in the current workspace: Node.js `v24.14.0`, npm `11.9.0`. README declares Node.js `>= 18`.
- Code size scan:
  - `server.js`: 4,533 lines.
  - `public/app.js`: 5,803 lines.
  - `lib/*.js`: smaller focused modules, including existing frp/server config helpers.
  - `scripts/*.js`: broad regression coverage and frp support scripts.
- Regression coverage already asserts explicit public bind remains possible through `CC_WEB_HOST=0.0.0.0`, so public-host direct access is an accepted behavior in the codebase.
- Authentication and public exposure safety:
  - If `config/auth.json` exists, the server uses its password.
  - If `.env` contains `CC_WEB_PASSWORD`, the server migrates it into `config/auth.json`.
  - Otherwise the server generates a random initial password and marks it as `mustChange`.
  - Password change enforces minimum length and character variety.
  - WebSocket auth uses 24-hour session tokens.
  - Failed auth attempts are tracked per client IP and can ban an IP for seven days.
  - `CC_WEB_TRUST_PROXY=1` is required before trusting `X-Forwarded-For`; otherwise the socket address is used.
- Security regressions already cover:
  - default bind is `127.0.0.1:8083`.
  - `CC_WEB_HOST` / `CC_WEB_PORT` override legacy `HOST` / `PORT`.
  - explicit public bind remains possible.
  - proxy IP trust is gated behind `CC_WEB_TRUST_PROXY=1`.

## Language and Runtime Findings
- Node.js is a strong fit for the current product because the app is an HTTP/WebSocket server that heavily uses filesystem access, child processes, static file serving, and browser UI integration.
- JavaScript/CommonJS keeps deployment simple: `npm install && npm start`, with no compile step.
- The largest technical debt is not the language choice itself; it is the size and breadth of `server.js`.
- TypeScript would improve maintainability and config contracts, but it would introduce a build step and does not directly improve the small-user deployment experience.
- Go or Rust could make single-binary distribution easier, but would require a large rewrite and would slow iteration on the existing browser/Node process-management model.
- For the ngrok/frp/direct-access work, staying in Node.js is the pragmatic best choice. A future TypeScript migration can be incremental if the project needs stronger internal contracts.
- The main maintainability risk is not "JavaScript vs another language"; it is unbounded file growth in `server.js` and `public/app.js`. New remote-access work should add focused `lib/tunnel-*` modules and avoid adding large blocks to `server.js`.

## Access Mode Design Findings
- The product should distinguish "how the machine is reachable" from "which tunnel tool is used".
- Recommended top-level modes:
  - `direct`: default browser access for this machine or the same LAN.
  - `public`: public-host direct access, for VPS/public servers with firewall/reverse proxy.
  - `ngrok`: small-user intranet tunnel using ngrok.
  - `frp`: advanced/self-hosted intranet tunnel using existing frp support.
- Direct browser access has two scopes:
  - `local`: default, only this machine through `127.0.0.1`.
  - `lan`: same-network sharing through concrete interface URLs such as `http://192.168.1.23:8083`.
- LAN scope should reuse the existing behavior that prints LAN URLs when binding to `0.0.0.0` or `::`, but should not display `0.0.0.0` as a user-facing URL.
- Public-host direct access should not require ngrok/frp. It should guide users to configure:
  - `CC_WEB_HOST=0.0.0.0` only when intentionally exposing the service.
  - `CC_WEB_PORT=8083` or another chosen port.
  - reverse proxy/HTTPS where possible.
  - strong cc-web password.
- Intranet access should keep `cc-web-enhance` bound to `127.0.0.1:8083`, then expose through a tunnel provider.
- Direct public-host mode should probably reuse existing `CC_WEB_HOST` / `CC_WEB_PORT` behavior rather than inventing a second bind configuration. A higher-level access mode can validate and explain the bind choice.
- Public-host mode should also surface `CC_WEB_TRUST_PROXY=1` only when the user is actually behind a trusted reverse proxy such as Nginx/Caddy/Cloudflare, because enabling it in arbitrary public exposure can make IP-based ban logic trust spoofable headers.
- Prior branch records and threat model reinforce the same constraints:
  - Default bind must stay `127.0.0.1:8083`.
  - Public exposure through `0.0.0.0` is a known risk and must remain explicit.
  - Tunnel examples/configs must not contain real IPs, domains, tokens, cookies, sessions, or auth headers.
  - Helper scripts should stay local-only unless the user explicitly starts a network-facing mode.
  - Existing frp support intentionally did not add automatic DNS/certificate provisioning; the ngrok design should avoid over-automating platform resources too.

## Technical Decisions
| Decision | Rationale |
|----------|-----------|
| Keep Node.js for this feature | It aligns with the existing WebSocket, child-process, and static UI architecture and avoids a rewrite. |
| Add an access-mode layer instead of replacing frp directly | It supports public hosts, ngrok users, and frp users without forcing one deployment model on everyone. |
| Merge local and LAN into `direct` with a scope | This reduces product choices while preserving the security distinction between loopback-only and LAN binding. |
| Make `ngrok` the recommended small-user tunnel path | It removes the need for a VPS/frps server and can feel integrated through the Node SDK. |
| Keep `frp` for self-hosted/advanced users | frp remains better for users who want full control or already have a VPS. |
| Do not auto-bind to `0.0.0.0` | Public exposure changes risk; it must be opt-in. |
| Keep prior frp threat-model constraints for ngrok/direct mode | The same public-exposure and secret-leak risks apply beyond frp. |

## Draft Deep Design

### Core Model
Introduce a first-class access mode instead of treating every remote-access path as a tunnel provider.

Proposed mode variable:

```env
CC_WEB_ACCESS_MODE=direct  # direct / public / ngrok / frp
CC_WEB_DIRECT_SCOPE=local  # local / lan
```

Mode behavior:

| Mode | Host Type | Network Behavior | Intended User |
|------|-----------|------------------|---------------|
| `direct` + scope `local` | Any | Bind only to `127.0.0.1:8083`; no public access | safest default |
| `direct` + scope `lan` | Same LAN/Wi-Fi | Bind according to `CC_WEB_HOST=0.0.0.0` or selected interface; no tunnel | phone/tablet/other LAN computer |
| `public` | Public VPS/server | Bind according to `CC_WEB_HOST` / `CC_WEB_PORT`; no tunnel | user already has public internet reachability |
| `ngrok` | Intranet/NAT host | Keep app on `127.0.0.1`; publish through ngrok | small-user default remote option |
| `frp` | Intranet/NAT host with own relay | Keep app on `127.0.0.1`; publish through frp | advanced/self-hosted users |

Compatibility:
- If `CC_WEB_ACCESS_MODE` is unset and `FRP_MODE=client/server` exists, resolve access mode as `frp` for backward compatibility.
- Do not infer `ngrok` just because `NGROK_AUTHTOKEN` exists. Starting a public tunnel must be explicit.
- Existing `CC_WEB_HOST` / `CC_WEB_PORT` remain the single source of truth for the Node server bind address.

### Config Sources and Precedence
Use two configuration channels:

1. `.env` / process environment for headless deployments and scripts.
2. `config/access.json` for Web UI-managed settings.

Precedence:

```text
process.env > config/access.json > compatibility fallback > defaults
```

This keeps Docker/systemd/server deployments deterministic while allowing non-technical users to configure remote access from the Web UI.

Proposed environment variables:

```env
CC_WEB_ACCESS_MODE=direct
CC_WEB_DIRECT_SCOPE=local
CC_WEB_PUBLIC_URL=
CC_WEB_TRUST_PROXY=0

NGROK_AUTHTOKEN=
NGROK_DOMAIN=
NGROK_BASIC_AUTH=
NGROK_AUTO_START=1

FRP_MODE=disabled
FRP_AUTO_START=1
```

`FRP_*` remains supported as-is. New work should avoid renaming existing frp variables unless a compatibility shim is provided.

### Startup Flow
Recommended startup sequence:

1. Load `.env`.
2. Resolve server bind config through existing `resolveServerBindConfig()`.
3. Create runtime directories.
4. Load or generate auth config before exposing a public URL.
5. Start `server.listen(PORT, HOST)`.
6. After listen succeeds, start the selected access integration:
   - `direct` + `local`: log local URL only.
   - `direct` + `lan`: log local URL plus concrete LAN URLs from network interfaces.
   - `public`: log direct/public mode status and optional `CC_WEB_PUBLIC_URL`.
   - `ngrok`: start ngrok listener to `http://127.0.0.1:<PORT>` and log/capture public URL.
   - `frp`: start existing managed frp process.
7. On shutdown, close ngrok listener or stop managed frp.

Reason for starting after `server.listen()`:
- avoids a tunnel pointing to a port that is not ready yet.
- lets auth config exist before a public URL is printed.
- preserves cleanup through the existing shutdown path.

### Module Boundaries
Add focused modules rather than expanding `server.js`:

```text
lib/access-config.js      # env + config/access.json normalization, masking, validation
lib/access-manager.js     # mode resolver and lifecycle facade
lib/ngrok-manager.js      # @ngrok/ngrok integration with injectable SDK for tests
```

Keep `lib/frp-config.js` and `lib/frp-manager.js` mostly intact, then wrap them from `access-manager.js`.

Expected lifecycle interface:

```js
startAccessFromEnv(env, { host, port, logger })
stopAccessHandle(handle)
getAccessStatus()
```

### ngrok Integration
Use the official `@ngrok/ngrok` Node SDK instead of downloading the ngrok CLI.

Reasons:
- avoids macOS/Linux/Windows binary download and extraction complexity.
- avoids pid-file and process command-line parsing issues.
- lets the app close listeners directly during shutdown.
- produces a stronger "built-in" product feel.

Default forwarding target:

```text
http://127.0.0.1:8083
```

Never forward to `0.0.0.0`; that is a bind address, not a safe upstream target.

### Direct Browser Access Mode
Direct browser access should be first-class because many users only want to open cc-web from the current machine, a phone, a tablet, or another computer on the same Wi-Fi.

Expected configuration:

```env
CC_WEB_ACCESS_MODE=direct
CC_WEB_DIRECT_SCOPE=local
CC_WEB_PORT=8083
```

Behavior:
- Do not start ngrok/frp.
- Scope `local`: listen only on `127.0.0.1` and show the local URL.
- Scope `lan`: listen on all interfaces or a selected LAN interface.
- Scope `lan`: show concrete LAN access URLs discovered through `os.networkInterfaces()`.
- Scope `lan`: never show `http://0.0.0.0:8083` as the URL users should open.
- Scope `lan`: if no non-loopback LAN IPv4 address is found, fall back to local-only status with a clear message.
- Keep authentication mandatory.
- Warn that LAN sharing is for trusted private networks. Users on public Wi-Fi should prefer local-only or a tunnel with stronger access controls.
- Mention possible OS firewall prompts on Windows/macOS and suggest allowing Node.js only on private networks.

LAN quick-login behavior:
- The same one-time pairing-link model can use a LAN URL as its base.
- The UI should allow selecting which LAN URL to use for QR/copy when multiple network interfaces exist.
- QR code is especially useful here because the common flow is "start on laptop, scan with phone".

### Public Host Mode
Public-host mode should be first-class, because some users deploy directly on a VPS or cloud machine.

Expected configuration:

```env
CC_WEB_ACCESS_MODE=public
CC_WEB_HOST=0.0.0.0
CC_WEB_PORT=8083
CC_WEB_PUBLIC_URL=https://cc.example.com
CC_WEB_TRUST_PROXY=1   # only when behind a trusted reverse proxy
```

Behavior:
- Do not start ngrok/frp.
- If `CC_WEB_HOST` is still `127.0.0.1`, show a warning/status that public mode is configured but not reachable externally.
- If `CC_WEB_PUBLIC_URL` is set, display it as the share/copy URL.
- If not set, display the bind address and advise docs/terminal output to configure DNS/reverse proxy.
- Keep authentication mandatory.

### Web UI Integration
Add a settings subpage named "Remote Access" / "远程访问" using the existing settings subpage pattern.

UI sections:
- Access mode segmented control: Direct / Public / ngrok / frp.
- Direct mode scope control: "仅本机" / "同一局域网".
- Current status: local only, LAN sharing, public server, starting, connected, failed.
- URL rows with copy/open buttons:
  - Local URL.
  - LAN URLs when available.
  - Public/tunnel URL when available.
- ngrok settings: token, optional domain, optional basic auth, start/stop.
- frp settings: keep a compact summary and link to advanced docs rather than duplicating every frp TOML option.
- Public host settings: bind host/port and public URL, with concise warnings.

WebSocket messages:

```text
get_access_config
save_access_config
get_access_status
start_access
stop_access
```

Tokens must be masked in responses, following existing notification/model config patterns.

### New User Interaction Design
Small users should not need to understand "bind address", "reverse proxy", or "tunnel provider" before they can make a good choice. The UI should present intent first, then map it to safe configuration.

Entry points:
- First successful login after startup: show a compact "Remote Access" onboarding panel if no access mode has been chosen.
- Settings footer: add a permanent "远程访问" card with status summary.
- Console output: show the local URL, current access mode, and the next action if remote access is not ready.

First-run remote access choices:

| Label | Maps To | User Copy |
|-------|---------|-----------|
| "本机或同一 Wi-Fi 访问" | `direct` | local page by default; can enable LAN sharing |
| "无公网下远程访问" | `ngrok` | easiest internet remote URL |
| "这台机器是公网服务器" | `public` | configure direct bind/reverse proxy |
| "我有自己的 frp 服务器" | `frp` | advanced self-hosted path |

The direct path should behave like a low-friction wizard:
1. Default to "仅本机".
2. Offer "允许同一局域网设备访问".
3. If LAN sharing is enabled, explain that devices must be on the same trusted network.
4. Ask for confirmation before binding beyond loopback.
5. Start or prompt restart with `CC_WEB_HOST=0.0.0.0`.
6. Show discovered LAN URLs with copy/open buttons.
7. Show a QR code for the selected LAN URL and optionally a quick-login link.

The ngrok path should behave like a wizard:
1. Ask for ngrok authtoken with a link to the ngrok token page.
2. Validate that the token is non-empty and not a masked placeholder.
3. Start ngrok and show a progress state: "正在创建远程入口".
4. When connected, show the public URL with copy/open buttons.
5. Show a small note that the URL is protected by the cc-web login page and can be stopped any time.

The public-host path should not automatically change bind settings. It should:
1. Explain that this mode is for VPS/public servers.
2. Offer to set `CC_WEB_HOST=0.0.0.0` only when the user confirms.
3. Recommend adding `CC_WEB_PUBLIC_URL` when a reverse proxy/domain exists.
4. Show `CC_WEB_TRUST_PROXY=1` only as an advanced toggle with a trusted-proxy warning.
5. Require restart if host/port changes are stored in `.env` or runtime config cannot safely hot-reload.

The frp path should be concise:
1. Show current `FRP_MODE`, status, and whether generated config contains placeholders.
2. Provide "download/setup/start/status" actions if implementation scope allows.
3. Link to advanced docs for server/client topology instead of forcing all frp fields into the basic UI.

### Quick Login Design
"Quick login" should mean fewer steps for the legitimate operator, not bypassing authentication on a public URL.

Recommended mechanism: one-time pairing login.

Use cases:
- First-time user starts cc-web locally, then opens the ngrok/public URL on a phone or another device.
- First-time user starts cc-web on a laptop, then opens a LAN URL on a phone/tablet.
- Authenticated user wants to open the current public URL on another device without typing a long random password.

Security properties:
- one use only.
- short TTL, recommended 10 minutes.
- generated only after auth config exists.
- never stored in tracked files.
- token hash stored in memory or ignored local config, not the raw token.
- does not reveal or replace the real password.
- invalidated after password change, server restart, or explicit "clear quick links".
- public URL still shows the normal login page if no valid quick token is supplied.

First-run quick login flow:
1. Server generates the random initial password as it does today.
2. If LAN/public/tunnel access is enabled, server can create a one-time pairing token.
3. Console prints:

```text
Local:  http://127.0.0.1:8083
LAN:    http://192.168.1.23:8083
Remote: https://xxxx.ngrok-free.app
Quick login: https://xxxx.ngrok-free.app/login?pair=<one-time-token>
Expires: 10 minutes, one use
```

4. User opens the quick link.
5. Browser exchanges `pair` for a normal auth session token over WebSocket or an HTTP endpoint.
6. UI immediately forces the existing first-login password change if `mustChange=true`.
7. After password change, all quick-login tokens are revoked.

Authenticated quick login flow:
1. In the "Remote Access" card, user clicks "生成一次性登录链接".
2. User chooses Local/LAN/Public/Tunnel URL when multiple URLs exist.
3. Server creates a one-time link for the chosen URL.
4. UI shows copy button and optional QR code.
5. Link expires after 10 minutes or after first successful use.

Implementation boundaries:
- Add `config/quick-login` only if persistence across restart is explicitly needed; default should be memory-only for lower risk.
- Prefer an HTTP exchange endpoint such as `POST /api/quick-login/exchange` that returns a short-lived auth token, then clears the pairing token.
- Never accept quick-login token as a bearer token for normal API/WebSocket operations.
- Add audit log lines with token id prefix only, never the full token.
- Do not include quick-login links in committed docs with realistic token-looking examples.

UI state after quick login:
- If `mustChange=true`, show the existing forced password-change dialog immediately.
- If password already exists, enter the app normally and show a small system message: "已通过一次性链接登录".
- If token expired/used, show normal login with a clear message and a button to return to password login.

### CLI Scripts
Add generic scripts for users who prefer terminal control:

```json
"access:start": "node scripts/access-control.js start",
"access:stop": "node scripts/access-control.js stop",
"access:status": "node scripts/access-control.js status"
```

Keep existing `frp:*` scripts for compatibility and advanced users.

### Security Rules
- Default remains local-only.
- Public or tunnel exposure requires explicit `CC_WEB_ACCESS_MODE`.
- Do not log ngrok/frp tokens.
- Do not write tokens to tracked files.
- Do not enable `CC_WEB_TRUST_PROXY=1` automatically.
- Do not auto-open firewall ports.
- Do not auto-change `CC_WEB_HOST` to `0.0.0.0`.
- Do not start more than one exposure path at a time.
- Avoid showing public URL until auth config exists.

### Test Strategy
Use offline and mock-based tests by default:

- `access-config` regression: mode normalization, env precedence, legacy `FRP_MODE` fallback, masked secrets.
- `lan` regression: concrete LAN URL rendering from mocked network interfaces; never present `0.0.0.0` as an open URL.
- `ngrok-manager` regression: mock SDK verifies `addr`, `authtoken`, `domain`, lifecycle close, error reporting.
- `access-manager` regression: direct/public/ngrok/frp dispatch, no double-start, shutdown cleanup.
- docs regression: `.env.example`, README, and design docs mention all four modes and safe defaults.
- security regression: no real endpoint/token patterns in examples; default remains `127.0.0.1`.

Avoid live ngrok network calls in default regression.

## Design Review Findings

### Findings
1. High: quick-login token in a query string can leak through browser history, proxy/tunnel logs, referrers, and screenshots.
   - Current draft example uses `/login?pair=<one-time-token>`.
   - Fix: use URL fragment for the pairing value, such as `/login#pair=<token>`, then have the browser exchange it with `POST /api/quick-login/exchange`. Fragments are not sent in HTTP requests. Also add `Referrer-Policy: no-referrer` for the app.

2. High: quick login currently conflicts with first-login forced password change.
   - Existing `handleChangePassword()` requires the current password. A user who enters through a quick-login link does not know the generated random initial password.
   - Fix: quick-login exchange should mint a normal auth token plus a one-time "initial password grant" when `authConfig.mustChange=true`. `change_password` may omit `currentPassword` only when the session has that grant and `mustChange=true`. Revoke the grant immediately after use.

3. High: auth failure banning may not work correctly behind ngrok or other local reverse tunnels.
   - If tunneled requests arrive from loopback, current IP logic may see `127.0.0.1`, which is whitelisted and not bannable.
   - If all users appear as the tunnel/proxy IP, one bad user can also lock out everyone.
   - Fix: access mode must define trusted client-IP policy:
     - `direct` local/LAN: use socket IP.
     - `ngrok`: accept forwarded client IP only when the socket peer is loopback/local tunnel ingress.
     - `public`: trust forwarded headers only when `CC_WEB_TRUST_PROXY=1` and, ideally, when the immediate peer is in a configured trusted proxy CIDR/list.

4. High: `direct` + scope `lan` must not blindly bind to `0.0.0.0` on multi-homed or public hosts.
   - Binding all interfaces on a VPS or a laptop with a public interface can expose the app beyond the intended LAN.
   - Fix: prefer binding to a selected private interface address when possible. Use `0.0.0.0` only behind an explicit advanced confirmation. Show only concrete private LAN URLs.

5. Medium: UI-managed config can disagree with actual runtime bind config.
   - `.env` has higher precedence and `server.listen()` happens at startup. If UI writes `config/access.json` after startup, host/port changes may not affect the current process.
   - Fix: status must distinguish desired config from actual runtime state. Host/port/scope changes should show "restart required" unless the server is designed to rebind safely.

6. Medium: public mode over plain HTTP sends password and auth token without transport encryption.
   - Current server is HTTP-only. A public VPS mode without reverse proxy/HTTPS is risky.
   - Fix: public mode should strongly recommend HTTPS and show a warning when `CC_WEB_PUBLIC_URL` is `http://` or unset. Disable quick-login generation for naked public HTTP unless the user explicitly overrides.

7. Medium: existing frp auto-start must be replaced, not duplicated.
   - Current `server.js` directly calls `startFrpFromEnv()`. A new `access-manager` that also starts frp could double-start.
   - Fix: `server.js` should call only `startAccessFromEnv()`, and `access-manager` should wrap existing frp behavior for backward compatibility.

8. Medium: token and secret handling needs explicit masking and storage rules.
   - ngrok tokens, frp tokens, basic-auth credentials, and quick-login tokens have different sensitivity.
   - Fix: raw quick-login token must never be stored; ngrok/frp credentials may live only in `.env` or ignored `config/access.json`, and all WebSocket config responses must be masked.

9. Low: ngrok/free-plan behavior and URL stability can confuse users.
   - Free ngrok URLs may change unless a static domain is configured.
   - Fix: UI should label generated ngrok URLs as "current session URL" unless `NGROK_DOMAIN` is set.

10. Low: test plan needs explicit regression for the review fixes.
   - Add tests for fragment-based quick login, initial password grant, forwarded-IP policy, LAN private-interface binding, restart-required state, and frp no-double-start.

### Required Design Amendments
- Replace query-string quick-login examples with fragment-based pairing links.
- Add one-time initial-password-change grant for quick-login first-run flow.
- Add trusted client-IP extraction policy per access mode.
- Make LAN scope prefer a selected private interface over `0.0.0.0`.
- Add actual-vs-desired runtime status and restart-required states.
- Treat public HTTP as a risky mode and restrict quick-login by default.
- Ensure `access-manager` is the only startup path for frp/ngrok exposure.

## Issues Encountered
| Issue | Resolution |
|-------|------------|
| `rg` is not installed in the workspace | Used `find` and `grep` for scanning. |

## Resources
- `package.json`
- `.env.example`
- `server.js`
- `lib/server-config.js`
- `lib/frp-config.js`
- `lib/frp-manager.js`
- `scripts/frp-download.js`
- `docs/intranet-access-design.md`
- `README.md`
- npm package metadata for `@ngrok/ngrok`: official SDK, no standalone binary management needed.

## 2026-05-24 Deployment Preset Findings
- Current `scripts/frp-download.js` resolves frp assets through the GitHub Releases API and verifies GitHub-provided SHA256 digests.
- Current `package.json` has no deploy preset scripts.
- Existing Windows startup entry is `start.bat`, but there are no international/mainland deployment wrappers.
- Mainland npm install should use `npm install --registry=https://registry.npmmirror.com` or an equivalent child-process env/argument, not `npm config set`.
- npmmirror provides an npm registry mirror; its generic binary HTML endpoint exists, but frp is not exposed through the tested `/-/binary/frp/` JSON endpoint.
- A mirror/proxy-based frp path should be configurable and keep checksum verification mandatory for direct mirror downloads.

## Visual/Browser Findings
- No visual mockups reviewed yet.
