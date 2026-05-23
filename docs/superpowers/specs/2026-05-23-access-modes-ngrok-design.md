---
title: Access Subsystem and Built-in ngrok Design
version: 2026-05-23
date_created: 2026-05-23
last_updated: 2026-05-23
owner: cc-web-enhance
tags:
  - design
  - access
  - ngrok
  - frp
  - security
---

# Access Subsystem and Built-in ngrok Design

## Objective
Give `cc-web-enhance` a single, understandable access story for small users and advanced users:
- local-only and same-LAN browser access
- public-host direct access
- intranet remote access through ngrok
- advanced self-hosted access through frp

The default remains safe. A user must explicitly choose to expose the app beyond loopback.

## Definitions
- **Direct access**: Browser access served by the cc-web Node.js process without a tunnel provider.
- **Local scope**: Direct access bound to loopback only, normally `127.0.0.1`.
- **LAN scope**: Direct access intended for devices on the same trusted local network.
- **Public host mode**: Direct access on a public server or behind a user-managed reverse proxy.
- **Tunnel provider**: A component that exposes the local cc-web service through a remote endpoint.
- **Access subsystem**: The new bounded subsystem that owns access-mode configuration, URL derivation, provider lifecycle, and quick-login pairing.
- **Provider adapter**: A small wrapper around a concrete provider such as ngrok or frp.
- **Desired config**: User-saved or environment-specified target access configuration.
- **Runtime status**: Actual current process state, URLs, warnings, and errors reported by the running server.
- **Locked field**: A UI field that is read-only because the same setting is currently controlled by `.env` or process environment.
- **ngrok mode**: Managed tunnel mode for users without a public IP or self-hosted tunnel server.
- **frp mode**: Advanced self-hosted tunnel mode using the existing frp integration.
- **Quick login**: A one-time pairing flow that creates a normal authenticated session after token exchange.

## Current Baseline
- Branch: `feature/intranet-access-frp-safe`
- Runtime: Node.js/CommonJS
- Main server entry: `server.js`
- Bind resolver: `lib/server-config.js`
- Existing frp support: `lib/frp-config.js`, `lib/frp-manager.js`, `scripts/frp-download.js`
- Existing auth model already supports:
  - stored password in `config/auth.json`
  - first-run random password with `mustChange`
  - 24-hour session tokens
  - IP-based anti-bruteforce banning

## Language / Runtime Decision
Keep the project on Node.js/CommonJS for this work.

Reasoning:
- The app is already a WebSocket/HTTP/file-system/child-process server.
- The deployment story is simple today and should stay that way.
- A rewrite to Go/Rust/TypeScript would add migration cost without solving the actual access-mode problem.

Optimization direction:
- keep the runtime as-is
- reduce future complexity by adding small focused modules
- avoid growing `server.js` and `public/app.js` further
- isolate tunnel/access logic behind a dedicated facade

Non-goal:
- no runtime rewrite
- no build step introduction
- no TypeScript migration in this feature

## Architecture Decision
Perform a scoped redesign of the access subsystem only.

The following areas must stay stable:
- Node.js/CommonJS runtime
- existing HTTP server and WebSocket protocol shape
- existing auth storage in `config/auth.json`
- existing session storage and agent runtime
- existing frp config and process-management modules
- current no-build frontend delivery model

The following areas may be redesigned:
- access-mode configuration
- URL derivation for local, LAN, public, and tunnel endpoints
- tunnel provider lifecycle
- quick-login pairing flow
- settings UI for remote access
- startup/shutdown orchestration for exposure providers

Rationale:
- The current project is already aligned with Node.js for local HTTP, WebSocket, filesystem, and process orchestration.
- The real complexity is access exposure, not the whole application runtime.
- A bounded access subsystem allows future providers such as Cloudflare Tunnel or Tailscale without changing auth, sessions, or agent execution.

Implementation rule:
- No provider-specific behavior should be added directly to `server.js` except calls into access subsystem facades.
- `server.js` remains the application boot and protocol orchestration layer.

## Requirements and Constraints
- **REQ-001**: The default access mode must remain local-only.
- **REQ-002**: Users must explicitly choose any mode that exposes cc-web beyond loopback.
- **REQ-003**: Direct browser access must cover both local machine access and same-LAN access.
- **REQ-004**: The user-facing ngrok option must be named around intent: "无公网下远程访问".
- **REQ-005**: Public-host users must be able to choose direct public deployment without configuring a tunnel.
- **REQ-006**: Existing frp users must remain supported through compatibility with current `FRP_*` variables.
- **REQ-007**: The UI must show current runtime state separately from desired saved configuration.
- **REQ-008**: New access/tunnel logic must live in focused modules, not as additional large blocks in `server.js`.
- **REQ-009**: Access subsystem modules must be independently testable through offline Node regression scripts.
- **REQ-010**: A saved UI config must not silently override environment-controlled settings.
- **REQ-011**: The system must expose one normalized access status object for console logs, WebSocket UI, and tests.
- **REQ-012**: The implementation must allow future tunnel providers to be added as provider adapters without changing auth/session logic.
- **REQ-013**: The startup path must not create a remote URL until the HTTP server is already listening.
- **REQ-014**: Public-host direct mode must be a first-class mode and must not require ngrok or frp.
- **SEC-001**: No public or tunnel URL may be displayed before authentication configuration exists.
- **SEC-002**: Secrets and pairing tokens must be masked in status output and omitted from tracked files.
- **SEC-003**: Quick-login pairing tokens must not be placed in URL query strings.
- **SEC-004**: Quick login must not bypass first-login password change requirements.
- **SEC-005**: `CC_WEB_TRUST_PROXY=1` must not be enabled automatically.
- **SEC-006**: Quick-login pair tokens must be memory-only, one-use, and short-lived.
- **SEC-007**: Naked public HTTP must not offer quick login by default.
- **SEC-008**: Only one exposure provider may be active from `npm start` at a time.
- **SEC-009**: ngrok must forward only to the local loopback upstream.
- **SEC-010**: `0.0.0.0` must never be rendered as a browser-openable URL.
- **UX-001**: The UI must present access choices by user intent, not provider jargon.
- **UX-002**: The LAN path must read as same Wi-Fi / same local network access.
- **UX-003**: The ngrok path must read as "无公网下远程访问".
- **UX-004**: Restart-required state must be explicit and must not imply inactive config is already applied.
- **OPS-001**: Provider start/stop errors must be non-fatal when the local cc-web server is otherwise usable.
- **OPS-002**: Logs must include provider state transitions with secrets masked.
- **CON-001**: This feature must not introduce a build step.
- **CON-002**: This feature must not rewrite the runtime away from Node.js/CommonJS.
- **CON-003**: Default regression tests must not require live ngrok network access.
- **CON-004**: This feature must not restructure unrelated auth, session, model, notification, or agent-runtime code.

## Top-Level Access Model
Use one top-level selector and one scope selector:

```env
CC_WEB_ACCESS_MODE=direct   # direct / public / ngrok / frp
CC_WEB_DIRECT_SCOPE=local   # local / lan
```

Meanings:
- `direct` + `local`: this machine only, via `127.0.0.1`
- `direct` + `lan`: same Wi-Fi / same LAN browser access
- `public`: VPS/public-host direct exposure
- `ngrok`: remote access for intranet/NAT hosts without a public IP
- `frp`: self-hosted tunnel for users who already run frps

Compatibility:
- if `CC_WEB_ACCESS_MODE` is unset and `FRP_MODE=client/server` exists, treat the mode as `frp`
- do not infer `ngrok` from `NGROK_AUTHTOKEN`
- `CC_WEB_HOST` / `CC_WEB_PORT` remain the source of truth for the Node server bind

## Provider Selection Matrix
| User intent | Internal mode | Scope/provider | Default bind | Remote provider | First implementation behavior |
|-------------|---------------|----------------|--------------|-----------------|-------------------------------|
| 本机网页访问 | `direct` | `local` | `127.0.0.1` | none | Default path; no extra setup. |
| 手机同 Wi-Fi 访问 | `direct` | `lan` | selected private LAN IP when possible | none | Show concrete LAN URLs; never show `0.0.0.0`. |
| 无公网下远程访问 | `ngrok` | ngrok tunnel | `127.0.0.1` upstream | ngrok SDK | Prompt for authtoken; create one managed remote URL. |
| 这台机器是公网服务器 | `public` | public direct | explicit user/env setting | none | Warn when still loopback; recommend HTTPS/reverse proxy. |
| 我有自己的 frp 服务器 | `frp` | existing frp manager | existing frp local settings | frp | Keep advanced/self-hosted path. |

Selection rules:
- `direct/local` is the only zero-config default.
- `direct/lan`, `public`, `ngrok`, and `frp` require explicit selection or compatibility fallback.
- Environment variables may lock the selected mode for headless deployment.
- The UI may save desired config, but it must show locked fields when `.env` or process env controls the value.

## Configuration and Precedence
Use two config channels:

1. `.env` / process environment for headless/server deployments
2. `config/access.json` for Web UI-managed settings

Precedence:

```text
process.env > config/access.json > compatibility fallback > defaults
```

Suggested environment variables:

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

Migration rules:
- Existing `CC_WEB_HOST` and `CC_WEB_PORT` behavior must remain compatible.
- Existing `HOST` and `PORT` legacy fallback must remain compatible.
- Existing `FRP_*` config remains valid.
- If `FRP_MODE=client` or `FRP_MODE=server` exists and `CC_WEB_ACCESS_MODE` is unset, resolve the access mode as `frp`.
- If `NGROK_AUTHTOKEN` exists but `CC_WEB_ACCESS_MODE` is unset, do not auto-enable ngrok.
- If both `CC_WEB_ACCESS_MODE` and legacy `FRP_MODE` exist, `CC_WEB_ACCESS_MODE` wins.
- If environment and `config/access.json` disagree, environment wins and the UI marks affected fields as locked.

## Runtime Flow
Required startup order:

1. load `.env`
2. create runtime directories
3. resolve desired access config with `access-config`
4. resolve `CC_WEB_HOST` / `CC_WEB_PORT` with access hints
5. create HTTP and WebSocket servers
6. start `server.listen(PORT, HOST)`
7. after listen succeeds, load or generate auth config
8. after auth config exists, start the selected access provider through `access-manager`
9. render local/LAN/public/tunnel URLs from normalized access status
10. on shutdown, close the active provider through `access-manager`

No tunnel provider may start before `server.listen()` succeeds.
No public or tunnel URL may be printed before auth config exists.

Provider behavior:
- `direct` + `local`: show local URL only
- `direct` + `lan`: show local URL plus concrete LAN URLs from network interfaces
- `public`: show direct/public status and optional public URL
- `ngrok`: start a listener to `http://127.0.0.1:<PORT>`
- `frp`: start managed `frpc` or `frps`

Shutdown order:
1. close WebSocket clients
2. stop active agent process tailers
3. stop access manager provider handle
4. close HTTP server
5. exit process

## Module Boundaries
Add focused modules instead of extending `server.js`:

```text
lib/access-config.js
lib/access-network.js
lib/access-manager.js
lib/ngrok-manager.js
lib/quick-login.js
```

Responsibilities:
- `access-config.js`: normalize env/UI config, mask secrets, validate modes
- `access-network.js`: derive private LAN addresses, shareable URLs, and safe bind recommendations
- `access-manager.js`: resolve the active access mode and own lifecycle
- `ngrok-manager.js`: wrap `@ngrok/ngrok` with testable injection
- `quick-login.js`: issue and exchange one-time pairing tokens and first-login password-change grants

Keep the existing frp modules and wrap them from `access-manager`.

Expected facades:

```js
// lib/access-config.js
resolveAccessConfig(env, { configDir })
loadAccessConfig(configDir)
saveAccessConfig(configDir, config)
maskAccessConfig(config)
getLockedAccessFields(env)

// lib/access-network.js
getPrivateIpv4Addresses(networkInterfaces)
buildLocalUrls(host, port)
buildLanUrls(port, networkInterfaces)
recommendLanBindHost(networkInterfaces)

// lib/ngrok-manager.js
startNgrokTunnel(options)
stopNgrokHandle(handle)
getNgrokStatus(handle)

// lib/access-manager.js
createAccessManager(options)
manager.start()
manager.stop()
manager.getStatus()
manager.reload(nextDesiredConfig)

// lib/quick-login.js
createQuickLoginStore(options)
store.issueLink(options)
store.exchange(pairToken)
store.consumeInitialPasswordChangeGrant(sessionToken)
store.clear()
```

Implementation plan:
- Detailed code structure and task breakdown live in `docs/superpowers/plans/2026-05-23-access-modes-ngrok-implementation.md`.
- `server.js` remains the boot/orchestration layer and should not absorb provider-specific behavior.
- `public/app.js` may receive the first settings UI integration because the project currently has no frontend build step; extract frontend access UI only after a stable app-level module boundary exists.

Boundary rules:
- `access-config` must not start providers.
- `access-network` must not read or write config files.
- `ngrok-manager` must not read UI config directly.
- `access-manager` must not inspect raw HTTP requests or WebSocket messages.
- `quick-login` must not know about ngrok or frp.
- `server.js` must not call `startFrpFromEnv()` directly after this feature is implemented.

## Interfaces and Data Contracts
`config/access.json` should store UI-managed desired state only. Runtime-derived fields such as active URLs, process state, tunnel handles, and provider errors must remain in memory/status APIs.

Saved file shape:

```json
{
  "mode": "direct",
  "directScope": "local",
  "publicUrl": "",
  "ngrok": {
    "authtoken": "",
    "domain": "",
    "basicAuth": "",
    "autoStart": true
  },
  "frp": {
    "autoStart": true
  }
}
```

Normalized config shape returned by backend code:

```json
{
  "mode": "direct",
  "directScope": "local",
  "publicUrl": "",
  "trustProxy": false,
  "ngrok": {
    "authtoken": "",
    "domain": "",
    "basicAuth": "",
    "autoStart": true
  },
  "frp": {
    "autoStart": true
  },
  "source": {
    "mode": "default",
    "directScope": "default",
    "ngrokAuthtoken": "unset"
  },
  "lockedFields": []
}
```

Status API shape:

```json
{
  "mode": "ngrok",
  "desiredMode": "ngrok",
  "directScope": "local",
  "actualState": "running",
  "provider": "ngrok",
  "restartRequired": false,
  "providerRestartRequired": false,
  "urls": {
    "local": ["http://127.0.0.1:8083"],
    "lan": ["http://192.168.1.23:8083"],
    "public": ["https://cc.example.com"],
    "remote": ["https://xxxx.ngrok-free.app"]
  },
  "quickLogin": {
    "allowed": true,
    "reason": "ok",
    "ttlSeconds": 600
  },
  "warnings": [],
  "errors": []
}
```

Authenticated WebSocket messages:

```text
get_access_config        -> access_config
save_access_config       -> access_config + access_status
get_access_status        -> access_status
start_access_provider    -> access_action_result + access_status
stop_access_provider     -> access_action_result + access_status
create_quick_login       -> quick_login_created
```

Quick-login creation contract:

```json
{
  "type": "create_quick_login",
  "preferredUrlKind": "remote"
}
```

Rules:
- `preferredUrlKind` is optional.
- Allowed values are `remote`, `public`, `lan`, and `local`.
- If omitted, the server chooses the first available URL in this order: `remote`, `public`, `lan`, `local`.
- The chosen URL must come from the current `access_status.urls` object.
- `public` maps only to `access_status.urls.public`.
- The server must reject any requested URL that is not currently available in `access_status`.

Successful response:

```json
{
  "type": "quick_login_created",
  "ok": true,
  "baseUrlKind": "remote",
  "baseUrl": "https://xxxx.ngrok-free.app",
  "url": "https://xxxx.ngrok-free.app/#pair=<one-time-token>",
  "ttlSeconds": 600,
  "expiresAt": "2026-05-23T12:34:56.789Z",
  "mustChangePassword": true
}
```

Rules:
- `baseUrl` is the absolute origin used to build the link.
- `url` is the full copyable browser link.
- `url` must always contain `#pair=<one-time-token>`.
- The pair token must not be returned in any query string.
- The pair token should not be returned separately unless a future test requires it; the link is sufficient for the first implementation.
- `baseUrlKind` must echo the selected source URL kind so the UI can label the link correctly.
- If a requested kind is not available, the server must return `ok: false` with `reason: 'no_eligible_url'`.
- If a URL exists but quick-login policy rejects it, the server must return `ok: false` with the current `quickLogin.reason`.
- Failed `quick_login_created` responses must include a fresh `access_status` payload.

Failure response:

```json
{
  "type": "quick_login_created",
  "ok": false,
  "reason": "public_http_disabled",
  "message": "Quick login is disabled for plain public HTTP.",
  "status": {
    "quickLogin": {
      "allowed": false,
      "reason": "public_http_disabled",
      "ttlSeconds": 600
    }
  }
}
```

Provider runtime control request and response:

```json
{
  "type": "start_access_provider",
  "provider": "ngrok"
}
```

```json
{
  "type": "access_action_result",
  "ok": true,
  "action": "start",
  "provider": "ngrok",
  "status": {
    "actualState": "running",
    "urls": {
      "remote": ["https://xxxx.ngrok-free.app"]
    }
  }
}
```

```json
{
  "type": "stop_access_provider",
  "provider": "ngrok"
}
```

Rules:
- `provider` may be omitted; when omitted, the server uses the current desired mode.
- Allowed provider values are `ngrok` and `frp`.
- Start is valid only when desired mode uses the requested provider.
- Stop is idempotent; stopping an already stopped provider returns `ok: true` with current status.
- Every start/stop response must include a fresh `access_status` payload or embedded `status` object with the same shape as `access_status`.
- Provider errors return `ok: false`, a masked `message`, and current `access_status`; they must not close the WebSocket.
- The UI must refresh status after every action response and must disable start/stop controls while state is `starting` or `stopping`.

Pairing HTTP endpoint:

```text
POST /api/quick-login/exchange
Content-Type: application/json

{ "pairToken": "<fragment-token>" }
```

Successful response:

```json
{
  "ok": true,
  "token": "<normal-session-token>",
  "mustChangePassword": true
}
```

Failure responses:
- invalid, expired, consumed, or missing token returns HTTP `401`.
- malformed JSON or missing `pairToken` returns HTTP `400`.
- all failures return `Cache-Control: no-store` and `Referrer-Policy: no-referrer`.

```json
{
  "ok": false,
  "reason": "invalid_or_expired",
  "message": "Quick login link is invalid or expired."
}
```

Required response headers for pairing:
- `Cache-Control: no-store`
- `Referrer-Policy: no-referrer`
- `Content-Type: application/json; charset=utf-8`

Quick-login link URL:
- The generated browser URL must use the app root path: `/#pair=<one-time-token>`.
- `/login#pair=<token>` is not valid for the first implementation because the current static server does not have a `/login` route.
- If a future implementation adds SPA fallback routing, `/login#pair=<token>` may be reconsidered with explicit tests.
- The link builder receives a resolved `baseUrl`; it must not infer a public origin from raw request headers unless that origin is present in current access status.

Public URL normalization:
- `CC_WEB_PUBLIC_URL` and UI `publicUrl` must be absolute `http://` or `https://` origins.
- A trailing slash is normalized away.
- Paths, query strings, hashes, credentials, and non-HTTP(S) schemes are invalid for the first implementation.
- A valid public URL appears only as `access_status.urls.public`.
- Plain `http://` public URLs are allowed for normal login compatibility but set `quickLogin.allowed=false` with reason `public_http_disabled`.

## Access Provider State Machine
Access providers must report one of these states:

| State | Meaning | User-facing behavior |
|-------|---------|----------------------|
| `disabled` | No provider is selected for the current mode. | Show local/LAN/public direct URLs only. |
| `starting` | Provider startup has been requested but no URL is ready. | Show progress state and keep previous safe URLs visible. |
| `running` | Provider is active and has a usable URL. | Show remote URL and quick-login action when allowed. |
| `stopping` | Provider stop has been requested. | Disable start/stop controls until settled. |
| `stopped` | Provider was selected but is not currently active. | Show start action and last warning if any. |
| `error` | Provider failed to start or stopped unexpectedly. | Show masked error and keep local access available. |

State transition rules:
- `direct/local`, `direct/lan`, and `public` normally report `disabled` provider state because no tunnel provider is required.
- `ngrok` may transition `stopped -> starting -> running` when `NGROK_AUTO_START=1` or the user starts it from UI.
- `frp` may transition through the same lifecycle by delegating to existing frp manager APIs.
- Provider errors must not crash the cc-web HTTP server unless the local server itself cannot bind.
- Switching between `ngrok` and `frp` must stop the previous provider before starting the next provider.
- UI labels must describe `disabled` in direct/public modes as "无需中继" or equivalent, not as unavailable access.

## Runtime Apply Matrix
| Change | Server restart required | Provider restart required | Live action |
|--------|-------------------------|---------------------------|-------------|
| `CC_WEB_PORT` / `CC_WEB_HOST` from environment | yes | yes if provider uses old upstream | Restart cc-web. |
| `directScope` local <-> lan when bind host changes | yes | no | Save desired config and show restart required. |
| `publicUrl` text only | no | no | Update status/UI immediately. |
| `mode` direct/public -> ngrok | no | yes | Start ngrok through `start_access_provider`. |
| `mode` ngrok -> direct/public | no | yes | Stop ngrok through `stop_access_provider`. |
| `mode` ngrok <-> frp | no | yes | Stop current provider before starting next provider. |
| `ngrok.authtoken` / `domain` / `basicAuth` | no | yes | Save config; restart provider when user applies. |
| `frp.autoStart` | no | yes on next provider lifecycle | Save config; do not rewrite frp TOML. |

Status fields:
- `restartRequired` means the HTTP server bind or process-level config requires cc-web restart.
- `providerRestartRequired` means the tunnel provider must be restarted, but the local cc-web server can keep running.
- `quickLogin.allowed` must be computed from current runtime status, not desired config alone.

Quick-login eligibility reasons:
- `ok`: quick login may be generated.
- `auth_not_ready`: auth config is not loaded.
- `no_reachable_url`: no local/LAN/remote URL is available for the selected mode.
- `provider_not_running`: selected tunnel provider is not running.
- `public_http_disabled`: effective public URL is plain HTTP.
- `unsupported_mode`: current mode does not support quick login generation.

## Client IP and Auth-Failure Policy
Authentication failure tracking must use a mode-aware client identity resolver.

Rules:
- In `direct/local` and `direct/lan`, use the socket remote address unless `CC_WEB_TRUST_PROXY=1`.
- In `public`, use socket remote address by default; use the first `X-Forwarded-For` address only when `CC_WEB_TRUST_PROXY=1`.
- In `ngrok` and `frp` tunnel modes, loopback socket addresses must not be automatically whitelisted for auth-failure tracking.
- In tunnel modes with `CC_WEB_TRUST_PROXY=0`, use a shared identity such as `tunnel:ngrok:unknown` or `tunnel:frp:unknown` when the socket address is loopback or otherwise represents the local tunnel agent.
- In tunnel modes with `CC_WEB_TRUST_PROXY=1`, use the first `X-Forwarded-For` address when present; fall back to the shared tunnel identity when absent.
- `CC_WEB_IP_WHITELIST` applies only to resolved real client IP addresses, not to shared tunnel identities.
- Tailscale-style `100.*` auto-whitelist applies only to direct socket identities, not to shared tunnel identities.

Required helper behavior:
```js
resolveAuthClientIdentity(req, {
  accessMode,
  provider,
  trustProxy,
  remoteAddress,
  forwardedFor
})
```

The helper must return:
```json
{
  "identity": "tunnel:ngrok:unknown",
  "kind": "tunnel-shared",
  "whitelistEligible": false
}
```

Regression coverage must prove that failed auth through a loopback tunnel path can still be counted and banned under the shared tunnel identity.

Ban path requirements:
- `isBanned(...)` must receive the resolved identity string, not raw socket IP.
- `recordAuthFailure(...)` must receive the same resolved identity string used by `isBanned(...)`.
- Persisted ban keys in `config/banned_ips.json` may remain string keys, but the key values must be resolved identities.
- Existing raw IP ban keys remain valid for direct/public real-IP identities.
- A shared tunnel identity such as `tunnel:ngrok:unknown` must be persisted and rejected on subsequent WebSocket connections after ban threshold is reached.
- Whitelist checks must run only when `identity.whitelistEligible=true`.

## Direct Browser Access
Direct access is one product concept with two scopes.

```env
CC_WEB_ACCESS_MODE=direct
CC_WEB_DIRECT_SCOPE=local
```

### Local scope
- listen on `127.0.0.1`
- show the local URL only
- safest default

### LAN scope
- allow same-network sharing
- show concrete LAN URLs discovered through `os.networkInterfaces()`
- never show `http://0.0.0.0:8083` as the openable URL
- if no non-loopback LAN IPv4 exists, fall back to local-only status

Operational rule:
- prefer a selected private interface address when possible
- use all-interface binding only behind an explicit confirmation path
- do not auto-open firewall ports
- if the host has multiple private interfaces, choose the first safe private address for initial implementation and reserve explicit interface selection for a later advanced UI

## Public Host Mode
Public-host mode is for servers that are already reachable from the internet.

```env
CC_WEB_ACCESS_MODE=public
CC_WEB_HOST=0.0.0.0
CC_WEB_PORT=8083
CC_WEB_PUBLIC_URL=https://cc.example.com
CC_WEB_TRUST_PROXY=1
```

Behavior:
- do not start ngrok/frp
- show a warning if `CC_WEB_HOST` is still `127.0.0.1`
- show the configured public URL if present
- require authentication
- strongly recommend HTTPS and a reverse proxy
- disable quick-login generation by default when the effective public URL is plain HTTP
- allow normal password login over HTTP only because existing deployments may rely on it; warn clearly that HTTPS is expected for internet exposure

## ngrok Integration
Use the official `@ngrok/ngrok` Node SDK.

Reasons:
- no binary download/extraction logic
- no pid-file management for the tunnel process
- easier cross-platform behavior
- cleaner shutdown
- supported through the Node dependency graph rather than per-OS CLI installation

Default upstream:

```text
http://127.0.0.1:8083
```

Never forward to `0.0.0.0`.

Configuration behavior:
- `NGROK_AUTHTOKEN` from environment locks the token field in UI.
- UI-saved authtoken is stored in `config/access.json` and masked when returned to the browser.
- If the UI posts a masked ngrok secret such as a value containing `****`, save logic must keep the previously stored secret instead of clearing or overwriting it.
- Empty secret input means clear the stored UI-managed secret only when the field is not environment-locked and the request explicitly marks the field as cleared.
- `NGROK_DOMAIN` is optional and should be described as a stable-domain advanced option.
- If ngrok startup fails, cc-web remains usable locally and the access status moves to `error`.

## Web UI
Add a "远程访问" settings page using the existing settings pattern.

UI content:
- access mode selector: Direct / Public / 无公网下远程访问 / frp
- direct scope control: 仅本机 / 同一局域网
- local URL, LAN URLs, and public/tunnel URL rows
- ngrok token and start/stop controls
- compact frp summary with link to advanced docs
- locked-field indicators for values controlled by `.env`
- explicit restart-required banner when saved desired config is not active
- quick-login action only when the current status says it is allowed

Status states should distinguish:
- current runtime state
- desired config
- restart required

UI save rules:
- Saving config updates `config/access.json` only for fields not controlled by environment variables.
- If the active server bind cannot change without restart, the UI must show saved-but-pending state.
- Start/stop buttons affect runtime provider handles only; they do not silently rewrite `.env`.
- Copy buttons may copy URLs or quick-login links, but must not show raw secrets.

## New User Interaction
The UI should be intent-first, not jargon-first.

First-run choices:
- 本机或同一 Wi-Fi 访问
- 无公网下远程访问
- 这台机器是公网服务器
- 我有自己的 frp 服务器

Behavior per choice:
- Direct: default to local, optionally enable LAN sharing
- ngrok: prompt for authtoken, then create a remote URL
- Public: ask before changing bind settings
- frp: stay concise and link to advanced docs

## Quick Login
Quick login is a one-time pairing flow, not a password bypass.

Properties:
- one use only
- short TTL, recommended 10 minutes
- generated only after auth exists
- never stored raw in tracked files
- invalidated after password change or restart
- memory-only by default
- unavailable by default on plain public HTTP

Important fix:
- use a URL fragment for pairing, not a query parameter
- exchange the fragment through `POST /api/quick-login/exchange`
- add `Referrer-Policy: no-referrer`

First-login fix:
- if `mustChange=true`, quick login must include a one-time initial-password-change grant
- this grant only allows one password change
- the grant is revoked immediately after use

Browser behavior:
- read `#pair=<token>` from `location.hash`
- immediately remove the fragment from browser history after reading
- call `POST /api/quick-login/exchange`
- store only the returned normal session token
- continue into the existing forced-password-change flow when `mustChangePassword=true`

Server behavior:
- generate a normal session token only after successful pair-token exchange
- mark pair token as consumed before returning success
- attach initial-password-change grant only to the returned session token
- clear all pair tokens and grants after password change

Example console output:

```text
Local:  http://127.0.0.1:8083
LAN:    http://192.168.1.23:8083
Remote: https://xxxx.ngrok-free.app
Quick login: https://xxxx.ngrok-free.app/#pair=<one-time-token>
Expires: 10 minutes, one use
```

## Security Rules
- default remains local-only
- public/tunnel exposure requires an explicit mode choice
- do not log ngrok/frp/quick-login tokens
- do not write tokens to tracked files
- do not auto-enable `CC_WEB_TRUST_PROXY=1`
- do not auto-open firewall ports
- do not auto-change `CC_WEB_HOST` to `0.0.0.0`
- do not start more than one exposure path at a time
- do not show public URLs until auth config exists
- do not allow quick login to bypass the normal auth model
- do not generate quick-login links for plain public HTTP by default
- do not trust `X-Forwarded-For` unless `CC_WEB_TRUST_PROXY=1`
- do not allow a tunnel provider to change the cc-web bind host implicitly
- do not store active provider handles or pair-token state in JSON config files
- do not treat loopback tunnel traffic as whitelist-eligible for auth-failure tracking
- do not load ngrok SDK at process top level where a platform/load failure would prevent local mode startup

## Risks and Fixes
1. Query-string quick-login leakage
   - Fix: fragment-based pairing and no-referrer policy
2. First-login password-change dead end
   - Fix: one-time initial-password-change grant
3. Trusted IP handling behind tunnels
   - Fix: access-mode-specific client IP policy
4. LAN binding on multi-homed hosts
   - Fix: prefer selected private interface addresses
5. UI/runtime config mismatch
   - Fix: show desired vs actual state and restart-required status
6. Public HTTP without TLS
   - Fix: strong HTTPS warning, avoid quick-login by default on naked HTTP
7. frp double-start
   - Fix: only `access-manager` starts providers

## Testing
Use offline tests and mocks by default:
- mode normalization and compatibility
- direct/LAN URL rendering
- ngrok SDK integration with injected mock
- first-login quick-login grant
- restart-required state
- frp no-double-start
- secret masking

Avoid live ngrok network calls in the default regression suite.

## Dependencies and Platform Support
Runtime dependencies:
- Node.js/CommonJS remains the application runtime.
- Existing `ws` dependency remains the WebSocket runtime.
- `@ngrok/ngrok` is added as the ngrok provider dependency.
- Existing frp binary tooling remains optional and unchanged for frp users.

Supported terminal deployment targets:
- macOS: `npm install`, `npm start`, ngrok mode through the Node SDK dependency.
- Linux: `npm install`, `npm start`, ngrok mode through the Node SDK dependency.
- Windows: `npm install`, `npm start` or `start.bat`, ngrok mode through the Node SDK dependency.

Platform rules:
- Missing or unsupported ngrok dependency must produce an actionable provider error, not crash local cc-web.
- `@ngrok/ngrok` must be lazy-loaded inside `ngrok-manager`, not required at top-level by `server.js`.
- frp remains the fallback advanced tunnel path for users who cannot use ngrok.
- Default tests must not assume a specific OS network interface name.
- Shell-only checks must remain optional or have Windows-compatible alternatives where they affect core verification.

## Acceptance Criteria
- **AC-001**: Given no access-related environment variables, when cc-web starts, then it listens on local-only defaults and starts no tunnel provider.
- **AC-002**: Given `CC_WEB_ACCESS_MODE=direct` and `CC_WEB_DIRECT_SCOPE=lan`, when cc-web starts, then it shows concrete private LAN URLs and never displays `0.0.0.0` as an openable URL.
- **AC-003**: Given `CC_WEB_ACCESS_MODE=ngrok` and a valid ngrok authtoken, when the server listen step succeeds, then the access manager starts exactly one ngrok tunnel to `http://127.0.0.1:<PORT>`.
- **AC-004**: Given `FRP_MODE=client` and no `CC_WEB_ACCESS_MODE`, when cc-web starts, then compatibility resolution selects frp mode.
- **AC-005**: Given public mode without HTTPS, when quick-login generation is requested, then the system warns or disables the flow according to the final policy.
- **AC-006**: Given a quick-login link is generated, when rendered in console or UI, then the token appears after `#pair=` and not inside the query string.
- **AC-007**: Given `mustChange=true`, when a quick-login token is exchanged, then the resulting session can perform exactly one initial password change and cannot use that grant afterward.
- **AC-008**: Given UI-managed config differs from the active runtime state, when the settings page is opened, then it shows restart-required state instead of implying the change is already active.
- **AC-009**: Given `NGROK_AUTHTOKEN` exists but access mode is unset, when cc-web starts, then ngrok is not started automatically.
- **AC-010**: Given `CC_WEB_ACCESS_MODE=public`, when cc-web starts, then neither ngrok nor frp is started by the access manager.
- **AC-011**: Given `.env` controls an access field, when the settings page opens, then that field is displayed as locked and is not overwritten by UI save.
- **AC-012**: Given an ngrok startup failure, when local cc-web is already listening, then the server remains usable and access status reports `error`.
- **AC-013**: Given a provider switch from ngrok to frp, when the new provider starts, then the previous provider has already been stopped.
- **AC-014**: Given plain public HTTP, when quick-login creation is requested, then quick login is denied by default with a clear warning.
- **AC-015**: Given the implementation is complete, when static scans inspect `server.js`, then direct `startFrpFromEnv()` startup is no longer used outside the access manager path.
- **AC-016**: Given macOS, Linux, or Windows terminal deployment, when users install dependencies and start cc-web, then the default local access mode works without extra tunnel setup.
- **AC-017**: Given provider start or stop is requested from the UI, when the action completes or fails, then the response includes `access_action_result` and fresh access status.
- **AC-018**: Given a quick-login link is generated, when opened in the browser, then the path is `/` and the token is carried only in the fragment as `#pair=`.
- **AC-019**: Given ngrok mode receives auth attempts through a loopback tunnel path, when login fails repeatedly, then failures are counted under a non-whitelist shared tunnel identity.
- **AC-020**: Given `@ngrok/ngrok` cannot be loaded on a platform, when cc-web starts in local mode, then the local server still starts.
- **AC-021**: Given a provider config change that does not affect `CC_WEB_HOST` or `CC_WEB_PORT`, when saved in the UI, then status shows `providerRestartRequired` instead of requiring a full cc-web restart.
- **AC-022**: Given a valid `CC_WEB_PUBLIC_URL`, when access status is rendered, then the normalized origin appears in `urls.public`.
- **AC-023**: Given plain public HTTP is available, when quick-login creation is requested for `public`, then the response is `ok:false` with `reason:"public_http_disabled"` and fresh access status.

## Validation Criteria
The implementation is compliant only if these checks pass:
- `node scripts/access-config-regression.js`
- `node scripts/access-network-regression.js`
- `node scripts/ngrok-manager-regression.js`
- `node scripts/access-manager-regression.js`
- `node scripts/quick-login-regression.js`
- `node scripts/access-http-ws-regression.js`
- `node scripts/access-auth-ip-regression.js`
- `npm run regression`
- `git diff --check`

Manual validation:
- Start default cc-web and confirm only local URL is shown.
- Enable LAN mode and confirm a phone on the same Wi-Fi can open the LAN URL after normal authentication.
- Enable ngrok mode with an authtoken and confirm the remote URL opens the normal login flow.
- Confirm quick-login link contains `#pair=` and does not leak a query token.
- Confirm public mode shows HTTPS warning when configured with an HTTP public URL.

## Open Questions
None for the first implementation.

Deferred decisions:
- Explicit LAN interface picker is deferred; first implementation uses automatic private-interface selection.
- Quick login on plain public HTTP is disabled by default; later versions may add an explicit advanced override.
- CLI editing for `config/access.json` is deferred; first implementation uses `.env` and Web UI only.
