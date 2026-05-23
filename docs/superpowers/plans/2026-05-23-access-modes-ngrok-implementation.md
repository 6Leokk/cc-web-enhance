# Access Modes and Built-in ngrok Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a unified access manager for `cc-web-enhance` so users can choose local, LAN, public-host, ngrok, or frp access with safe defaults, quick-login pairing, and minimal user friction.

**Architecture:** Keep the Node.js/CommonJS runtime. Extract access-mode logic into small focused modules for config resolution, network/url derivation, tunnel lifecycle, and quick-login token exchange. Keep `server.js` as the orchestration point only: it should load config, start HTTP/WebSocket, delegate provider lifecycle, and expose status to the UI.

**Tech Stack:** Node.js/CommonJS, `ws`, `@ngrok/ngrok`, existing frp utilities, vanilla browser JS, offline regression scripts

---

## File Structure Map

### New backend modules
- Create `lib/access-config.js`
  - Normalize `CC_WEB_ACCESS_MODE`, `CC_WEB_DIRECT_SCOPE`, `NGROK_*`, and `FRP_*` inputs.
  - Load and save `config/access.json`.
  - Merge precedence: `process.env > config/access.json > compatibility fallback > defaults`.
  - Mask secrets before returning values to the UI.

- Create `lib/access-network.js`
  - Discover LAN IPv4 addresses from `os.networkInterfaces()`.
  - Build local/LAN/public URL lists.
  - Recommend a safe bind host for LAN scope when possible.

- Create `lib/access-auth-ip.js`
  - Resolve auth-failure identity from socket address, access mode, and trusted proxy settings.
  - Prevent loopback tunnel traffic from bypassing auth-failure counting.
  - Keep direct/local loopback behavior compatible.

- Create `lib/ngrok-manager.js`
  - Wrap the official `@ngrok/ngrok` SDK behind a small adapter.
  - Start and stop one tunnel listener to `http://127.0.0.1:<PORT>`.
  - Return a normalized status object with remote URL and warning text.

- Create `lib/access-manager.js`
  - Own the active access provider lifecycle.
  - Start/stop exactly one provider at a time.
  - Wrap existing frp manager calls instead of duplicating frp logic.
  - Produce a single status object for the UI and logs.

- Create `lib/quick-login.js`
  - Issue one-time pairing tokens.
  - Exchange fragment tokens through HTTP.
  - Track short-lived password-change grants for first login.

### Backend files to modify
- Modify `server.js`
  - Replace direct `startFrpFromEnv()` usage with `access-manager`.
  - Add HTTP endpoint for quick-login exchange.
  - Add access settings/status WS handlers.
  - Add headers for referrer policy and no-store on pairing flows.
  - Preserve existing auth, sessions, notifications, and model config flows.

- Modify `lib/server-config.js`
  - Accept access-mode recommendations when resolving bind host.
  - Keep `CC_WEB_HOST` / `CC_WEB_PORT` as the authoritative override path.
  - Support a safer LAN bind recommendation for direct LAN scope.

- Modify `package.json`
  - Add `@ngrok/ngrok`.
  - Add regression script entries for access config, access manager, quick login, and ngrok adapter behavior.

### Frontend files to modify
- Modify `public/app.js`
  - Add the new "远程访问" settings page.
  - Render access mode, LAN scope, tunnel credentials, current status, restart-required state, and quick-login controls.
  - Read quick-login tokens from URL fragment, not query string.
  - Remove fragment token from location history immediately after exchange.

- Modify `public/styles/50-settings-modals.css`
  - Add compact layouts for access settings and status rows.
  - Keep the settings page dense and scan-friendly.

- Modify `public/index.html`
  - Only if a new script split becomes necessary later.
  - Prefer keeping the current single-script bootstrap until the backend and settings flow are stable.

### Docs and metadata
- Modify `.env.example`
- Modify `README.md`
- Modify `README.en.md`
- Modify `docs/intranet-access-design.md`
- Modify `docs/deploy-frp.md` if the old frp workflow text needs alignment

### Tests and regressions
- Create `scripts/access-config-regression.js`
- Create `scripts/access-network-regression.js`
- Create `scripts/access-auth-ip-regression.js`
- Create `scripts/ngrok-manager-regression.js`
- Create `scripts/access-manager-regression.js`
- Create `scripts/quick-login-regression.js`
- Create `scripts/access-http-ws-regression.js`
- Extend `scripts/frp-builtin-regression.js`
- Extend `scripts/intranet-frp-safety-regression.js`

---

## Runtime Boot Sequence

The final startup order should be:

1. Load `.env` exactly as today.
2. Create runtime directories.
3. Resolve access desired config with `resolveAccessConfig(process.env, { configDir })`.
4. Resolve `HOST` and `PORT` with `resolveServerBindConfig(process.env, { accessConfig, networkInterfaces })`.
5. Create the HTTP server and WebSocket server.
6. Call `server.listen(PORT, HOST, callback)`.
7. Inside the listen callback:
   - call `ensureAuthLoaded()`
   - create and start the access manager
   - log local/LAN/remote URLs from `accessManager.getStatus()`
   - issue quick-login links only after auth state exists
8. On shutdown:
   - close WebSocket clients
   - stop active agent processes
   - call `accessManager.stop()`
   - close the HTTP server

Important rule: no tunnel provider starts before the HTTP server successfully listens. This avoids creating a remote URL for a process that cannot serve traffic.

## Backend Interface Contracts

### Access config module

Normalized config returned by `resolveAccessConfig`:

```js
{
  mode: 'direct',
  directScope: 'local',
  publicUrl: '',
  trustProxy: false,
  ngrok: {
    authtoken: '',
    domain: '',
    basicAuth: '',
    autoStart: true
  },
  frp: {
    autoStart: true
  },
  source: {
    mode: 'default',
    directScope: 'default',
    ngrokAuthtoken: 'unset'
  },
  lockedFields: []
}
```

### Access status object

All UI and console rendering should use this status shape:

```js
{
  mode: 'ngrok',
  desiredMode: 'ngrok',
  directScope: 'local',
  actualState: 'running',
  provider: 'ngrok',
  restartRequired: false,
  urls: {
    local: ['http://127.0.0.1:8083'],
    lan: ['http://192.168.1.23:8083'],
    public: ['https://cc.example.com'],
    remote: ['https://xxxx.ngrok-free.app']
  },
  warnings: [],
  errors: [],
  quickLogin: {
    allowed: true,
    reason: 'ok',
    ttlSeconds: 600
  },
  providerRestartRequired: false
}
```

### WebSocket messages

New authenticated messages:

```text
get_access_config        -> access_config
save_access_config       -> access_config + access_status
get_access_status        -> access_status
start_access_provider    -> access_action_result + access_status
stop_access_provider     -> access_action_result + access_status
create_quick_login       -> quick_login_created
```

Quick-login creation messages:

```js
{ type: 'create_quick_login', preferredUrlKind: 'remote' }
```

Response:

```js
{
  type: 'quick_login_created',
  ok: true,
  baseUrlKind: 'remote',
  baseUrl: 'https://xxxx.ngrok-free.app',
  url: 'https://xxxx.ngrok-free.app/#pair=<one-time-token>',
  ttlSeconds: 600,
  expiresAt: '2026-05-23T12:34:56.789Z',
  mustChangePassword: true
}
```

Rules:
- `preferredUrlKind` is optional.
- Valid kinds: `remote`, `public`, `lan`, `local`.
- If omitted, select the first currently available URL in this order: `remote`, `public`, `lan`, `local`.
- The selected base URL must come from the current access status URL lists.
- `public` maps only to `access_status.urls.public`.
- Invalid or unavailable kinds return `ok: false`, `reason: 'no_eligible_url'`, and fresh access status.
- Existing URLs rejected by quick-login policy return `ok: false`, the current `quickLogin.reason`, and fresh access status.
- The full link uses the root path: `/#pair=<token>`.

Failure response:

```js
{
  type: 'quick_login_created',
  ok: false,
  reason: 'public_http_disabled',
  message: 'Quick login is disabled for plain public HTTP.',
  status: {
    quickLogin: {
      allowed: false,
      reason: 'public_http_disabled',
      ttlSeconds: 600
    }
  }
}
```

Provider runtime control messages:

```text
start_access_provider    -> access_action_result + access_status
stop_access_provider     -> access_action_result + access_status
```

Request body:

```js
{ type: 'start_access_provider', provider: 'ngrok' }
{ type: 'stop_access_provider', provider: 'ngrok' }
```

Rules:
- `provider` may be omitted; omitted means current desired provider.
- Supported provider values are `ngrok` and `frp`.
- Stop is idempotent.
- Start/stop errors return `access_action_result` with `ok: false` and masked message.
- Every action response must include fresh access status.

Save behavior:
- If `.env` overrides a field, `save_access_config` must not silently overwrite that runtime value.
- The response must include `lockedFields` so the UI can display read-only state.
- Changes that require a restart must return `restartRequired: true`.

### HTTP endpoint

Unauthenticated but token-protected pairing endpoint:

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

Headers:
- `Cache-Control: no-store`
- `Referrer-Policy: no-referrer`
- `Content-Type: application/json; charset=utf-8`

## Security Implementation Rules

- The ngrok upstream must always be loopback: `http://127.0.0.1:<PORT>`.
- `0.0.0.0` must never be rendered as a clickable/openable URL.
- `access-manager` is the only path that may start ngrok or frp during `npm start`.
- Quick-login pair tokens must be stored in memory only.
- Quick-login links must use `#pair=<token>`, never `?pair=<token>`.
- Password change must clear all normal sessions and all pending quick-login grants.
- Logs must use masked access config and masked provider errors.
- The UI must not display a quick-login action for naked public HTTP unless the final policy explicitly allows it with a warning.
- Quick-login links must use `/#pair=<token>` because the current static server does not serve `/login`.
- Tunnel-mode auth failures from loopback tunnel agents must use a non-whitelist shared tunnel identity unless trusted forwarded IP is enabled and present.

---

## Runtime Apply Matrix

Implementation must use these state flags consistently:

| Change | `restartRequired` | `providerRestartRequired` | Expected behavior |
|--------|-------------------|---------------------------|-------------------|
| `CC_WEB_HOST` / `CC_WEB_PORT` | true | true if provider uses old upstream | Save nothing silently; tell user to restart cc-web. |
| `directScope` changes bind host | true | false | Save desired config and show restart-required. |
| `publicUrl` only | false | false | Apply to status/UI immediately. |
| direct/public -> ngrok | false | true until started | User may start provider without restarting cc-web. |
| ngrok -> direct/public | false | true until stopped | Stop provider without restarting cc-web. |
| ngrok <-> frp | false | true | Stop current provider before starting next. |
| ngrok token/domain/basic auth | false | true | Save config and restart provider. |

---

## Task 1: Access Config Core

**Files:**
- Create `lib/access-config.js`
- Modify `package.json`
- Create `scripts/access-config-regression.js`

- [x] **Step 1: Write failing regression checks**

Cover:
- default mode is `direct` + `local`
- compatibility fallback from existing `FRP_MODE`
- secret masking
- masked secret round-trip keeps previously stored values
- explicit secret clear works only for UI-managed, non-env-locked fields
- public URL normalization accepts origin-only HTTP(S) URLs and strips trailing slash
- public URL normalization rejects paths, query strings, hashes, credentials, and non-HTTP(S) schemes
- invalid mode rejection
- config file load/save round-trip

- [x] **Step 2: Run the regression and confirm it fails**

Run:
```bash
node scripts/access-config-regression.js
```

- [x] **Step 3: Implement the config resolver**

The module should export at least:
```js
loadAccessConfig(configDir, env)
saveAccessConfig(configDir, config)
resolveAccessConfig(env, options)
maskAccessConfig(config)
normalizeAccessMode(value)
normalizeDirectScope(value)
```

- [x] **Step 4: Run the regression again**

Run:
```bash
node scripts/access-config-regression.js
```

Expected: PASS.

- [x] **Step 5: Keep the API stable for the next tasks**

Return a normalized object that can drive both server startup and UI status rendering.

---

## Task 2: LAN and URL Resolution

**Files:**
- Create `lib/access-network.js`
- Modify `lib/server-config.js`
- Create `scripts/access-network-regression.js`

- [x] **Step 1: Write failing tests for URL derivation**

Cover:
- local-only URL list
- LAN URL list from private IPv4 interfaces
- fallback when no private interface exists
- no `0.0.0.0` as an openable URL

- [x] **Step 2: Run the regression and confirm failure**

Run:
```bash
node scripts/access-network-regression.js
```

- [x] **Step 3: Implement the helper layer**

The helper should export:
```js
getPrivateIpv4Addresses(interfaces)
buildLocalUrls(host, port)
buildLanUrls(port, interfaces)
recommendLanBindHost(interfaces)
```

- [x] **Step 4: Wire `server-config` to accept access hints**

Keep explicit `CC_WEB_HOST` and `HOST` overrides intact.
Only use the LAN recommendation when no explicit host override exists.

- [x] **Step 5: Re-run the regression**

Run:
```bash
node scripts/access-network-regression.js
```

Expected: PASS.

---

## Task 3: Auth Client Identity Policy

**Files:**
- Create `lib/access-auth-ip.js`
- Create `scripts/access-auth-ip-regression.js`
- Later integration point: `server.js`

- [x] **Step 1: Write failing client identity tests**

Cover:
- direct/local loopback remains whitelist-eligible
- direct/LAN socket addresses use remote address
- public mode uses socket address unless `CC_WEB_TRUST_PROXY=1`
- public mode with `CC_WEB_TRUST_PROXY=1` uses first `X-Forwarded-For`
- ngrok/frp loopback tunnel traffic resolves to `tunnel:<provider>:unknown`
- shared tunnel identities are not whitelist-eligible
- `CC_WEB_IP_WHITELIST` applies to resolved real client IPs, not shared tunnel identities
- the same resolved identity string is suitable for `isBanned()` and `recordAuthFailure()`

- [x] **Step 2: Run the regression and confirm failure**

Run:
```bash
node scripts/access-auth-ip-regression.js
```

- [x] **Step 3: Implement the resolver**

The helper should export:
```js
resolveAuthClientIdentity(req, options)
isAccessIdentityWhitelisted(identity, options)
```

Expected identity object:
```js
{
  identity: 'tunnel:ngrok:unknown',
  kind: 'tunnel-shared',
  whitelistEligible: false
}
```

- [x] **Step 4: Re-run the regression**

Run:
```bash
node scripts/access-auth-ip-regression.js
```

Expected: PASS.

---

## Task 4: ngrok Adapter and Lifecycle

**Files:**
- Create `lib/ngrok-manager.js`
- Modify `package.json`
- Create `scripts/ngrok-manager-regression.js`

- [x] **Step 1: Write failing adapter tests**

Cover:
- missing authtoken returns a skipped state
- valid options create a forward listener to loopback
- listener close calls the adapter cleanup path
- errors are masked and do not log tokens
- missing or unsupported `@ngrok/ngrok` dependency returns a provider error without crashing module import

- [x] **Step 2: Run the regression and confirm failure**

Run:
```bash
node scripts/ngrok-manager-regression.js
```

- [x] **Step 3: Implement the adapter**

Keep the dependency boundary tiny:
```js
startNgrokTunnel({ port, authtoken, domain, basicAuth, logger, ngrokSdk })
stopNgrokHandle(handle)
getNgrokStatus(handle)
```

Use the official SDK `forward` API through an injected `ngrokSdk` so tests can stub it without network calls. Lazy-load `@ngrok/ngrok` inside `startNgrokTunnel`; `server.js` must not require the SDK directly.

- [x] **Step 4: Re-run the regression**

Run:
```bash
node scripts/ngrok-manager-regression.js
```

Expected: PASS.

- [x] **Step 5: Confirm no live network dependency**

The default regression suite must stay offline.

---

## Task 5: Unified Access Manager

**Files:**
- Create `lib/access-manager.js`
- Modify `server.js`
- Create `scripts/access-manager-regression.js`

- [x] **Step 1: Write failing lifecycle tests**

Cover:
- direct/local returns only local status
- direct/LAN returns local plus LAN URLs
- public mode shows direct exposure and warnings
- ngrok starts exactly one tunnel
- frp delegates to the existing frp manager
- stop closes whichever provider is active
- status returns desired state, actual state, urls, and warnings

- [x] **Step 2: Run the regression and confirm failure**

Run:
```bash
node scripts/access-manager-regression.js
```

- [x] **Step 3: Implement the manager**

The manager should expose:
```js
createAccessManager(options)
manager.start()
manager.stop()
manager.getStatus()
manager.reload(desiredConfig)
```

The manager should accept injected dependencies:
```js
{
  env,
  host,
  port,
  logger,
  networkInterfaces,
  frpManager,
  ngrokManager,
  accessConfig
}
```

- [x] **Step 4: Replace direct frp startup in server.js**

Remove the direct `startFrpFromEnv(process.env, ...)` call from the boot path.
The access manager becomes the only startup path for exposure providers.

- [x] **Step 5: Re-run the regression**

Run:
```bash
node scripts/access-manager-regression.js
```

Expected: PASS.

---

## Task 6: Quick Login and First-Login Grant

**Files:**
- Create `lib/quick-login.js`
- Modify `server.js`
- Create `scripts/quick-login-regression.js`

- [x] **Step 1: Write failing security tests**

Cover:
- token issued as a fragment-safe link
- link path is `/#pair=<token>`, not `/login#pair=<token>`
- token exchange happens over POST
- token is one-time and short-lived
- token cannot be replayed after restart or password change
- `mustChange=true` grants exactly one password change

- [x] **Step 2: Run the regression and confirm failure**

Run:
```bash
node scripts/quick-login-regression.js
```

- [x] **Step 3: Implement token issuance and exchange**

Recommended backend behavior:
```js
issueQuickLoginLink({ baseUrl, token, ttlMs })
exchangeQuickLoginToken({ token, now })
consumeInitialPasswordChangeGrant({ sessionToken })
```

Store only hashed or in-memory pairing state where feasible.

- [x] **Step 4: Connect quick login to auth**

`handleChangePassword()` must accept a one-time grant when the user arrived through quick login and `authConfig.mustChange` was true.

- [x] **Step 5: Re-run the regression**

Run:
```bash
node scripts/quick-login-regression.js
```

Expected: PASS.

---

## Task 7: HTTP and WebSocket Integration

**Files:**
- Modify `server.js`
- Modify `public/app.js`
- Modify `public/index.html` only if needed
- Modify `public/styles/50-settings-modals.css`

- [x] **Step 1: Write integration tests for new messages**

Cover:
- `get_access_config`
- `save_access_config`
- `get_access_status`
- `start_access_provider`
- `stop_access_provider`
- `access_action_result`
- `create_quick_login`
- `quick_login_created` response includes `baseUrlKind`, `baseUrl`, `url`, `ttlSeconds`, and `expiresAt`
- unavailable quick-login URL kind returns `ok: false` with `reason: 'no_eligible_url'`
- plain public HTTP quick-login creation returns `ok: false` with `reason: 'public_http_disabled'` and fresh access status
- public quick-login uses only `access_status.urls.public`
- `publicUrl` with path/query/hash/credentials is rejected; trailing slash is normalized away
- invalid/expired/consumed `POST /api/quick-login/exchange` token returns a defined failure body and HTTP status
- referrer-policy header presence
- no-store on pairing endpoints
- `/#pair=` link generation and browser fragment cleanup
- tunnel-mode auth failures do not use whitelist-eligible loopback identity
- tunnel-mode ban lookup rejects a later WebSocket connection using the same shared identity after threshold

- [x] **Step 2: Run the regression and confirm failure**

Run:
```bash
node scripts/access-http-ws-regression.js
```

- [x] **Step 3: Implement backend handlers**

Add the minimal message flow:
```js
case 'get_access_config'
case 'save_access_config'
case 'get_access_status'
case 'start_access_provider'
case 'stop_access_provider'
case 'create_quick_login'
```

Add HTTP endpoint:
```text
POST /api/quick-login/exchange
```

Replace auth-failure identity handling:
```js
const identity = resolveAuthClientIdentity(req, {
  accessMode: accessManager.getStatus().mode,
  provider: accessManager.getStatus().provider,
  trustProxy: TRUST_PROXY,
});
```

Use `identity.identity` for all auth-failure and ban paths:
```js
isBanned(identity.identity)
recordAuthFailure(identity.identity)
bannedIPs.set(identity.identity, expireTimestamp)
```

Use `identity.whitelistEligible` before applying whitelist logic. The initial WebSocket connection rejection path, the per-auth-message ban check, failed-login counter, persisted ban file, and subsequent reconnect rejection must all use the same resolved identity key.

Add quick-login creation handler:
```js
case 'create_quick_login'
```

Handler rules:
- Resolve `preferredUrlKind` against current access status.
- If no preferred kind is provided, choose `remote`, then `public`, then `lan`, then `local`.
- Reject a kind that is not currently available.
- Reject URL kinds that are available but disallowed by `status.quickLogin.allowed=false`, returning `status.quickLogin.reason`.
- Normalize `CC_WEB_PUBLIC_URL` / UI `publicUrl` as an origin-only `access_status.urls.public` value before quick-login selection.
- Pass the resolved `baseUrl` into `issueQuickLoginLink({ baseUrl, token, ttlMs })`.
- Return `quick_login_created` with the full `/#pair=` URL.

- [x] **Step 4: Implement frontend settings UI**

The settings page should show:
- access mode selector
- direct scope selector
- local/LAN/remote URLs
- tunnel status
- restart-required notice
- provider-restart-required notice
- quick-login link generation
- start/stop provider controls

Quick-login UI behavior:
- For each available URL row, allow creating a link for that URL kind.
- If the user clicks the generic quick-login action, call `create_quick_login` without `preferredUrlKind` and let the server choose the best URL.
- Display the `baseUrlKind` returned by the server so users can tell whether the copied link is remote, public, LAN, or local.
- Do not build the quick-login URL in the browser from raw host headers; use the server response.

- [x] **Step 5: Re-run the regression**

Run:
```bash
node scripts/access-http-ws-regression.js
```

Expected: PASS.

---

## Task 8: Documentation, Defaults, and Package Wiring

**Files:**
- Modify `.env.example`
- Modify `README.md`
- Modify `README.en.md`
- Modify `docs/intranet-access-design.md`
- Modify `docs/deploy-frp.md` if needed
- Modify `package.json`

- [x] **Step 1: Update the documented user flow**

Document the small-user flow:
- open settings
- choose local / LAN / 无公网下远程访问 / public / frp
- scan QR or use quick-login link
- restart only when bind or provider state requires it

- [x] **Step 2: Update env examples**

Document:
- `CC_WEB_ACCESS_MODE`
- `CC_WEB_DIRECT_SCOPE`
- `NGROK_AUTHTOKEN`
- `NGROK_DOMAIN`
- `NGROK_BASIC_AUTH`
- `FRP_MODE` compatibility notes

- [x] **Step 3: Document script wiring**

Add npm entries for:
- access config regression
- access network regression
- access auth IP regression
- ngrok manager regression
- access manager regression
- quick-login regression
- access HTTP/WS regression

Implementation note:
- document the intended script surface in the README and plan
- wire the runtime regression scripts in `package.json`

- [x] **Step 4: Re-run repo checks**

Run:
```bash
npm run regression
git diff --check
```

Expected: PASS.

---

## Acceptance Criteria

- **AC-001**: Local-only remains the default mode without extra configuration.
- **AC-002**: Direct/LAN mode surfaces concrete private LAN URLs and does not present `0.0.0.0` as a shareable URL.
- **AC-003**: Public-host mode does not start tunnel providers.
- **AC-004**: ngrok mode starts one managed tunnel to the local loopback service and exposes the remote URL through the access manager status.
- **AC-005**: frp mode continues to work through the existing frp manager and does not double-start from `server.js`.
- **AC-006**: Quick login uses a fragment token and a POST exchange path, not a query string.
- **AC-007**: First-login password change still works after quick-login pairing when `mustChange=true`.
- **AC-008**: UI state clearly distinguishes desired settings from actual runtime state and shows restart-required when needed.
- **AC-009**: Default regression checks remain offline.
- **AC-010**: No secret or pairing token is written to tracked files.
- **AC-011**: Quick-login creation response identifies the selected URL kind and returns a full `/#pair=` link.
- **AC-012**: Tunnel-mode ban lookup and failed-login counting use the same resolved identity key.
- **AC-013**: Public URLs appear only in `access_status.urls.public` after origin-only normalization.
- **AC-014**: Policy-denied quick-login creation returns a stable reason and fresh access status.

## Verification Checklist

- `node scripts/access-config-regression.js`
- `node scripts/access-network-regression.js`
- `node scripts/access-auth-ip-regression.js`
- `node scripts/ngrok-manager-regression.js`
- `node scripts/access-manager-regression.js`
- `node scripts/quick-login-regression.js`
- `node scripts/access-http-ws-regression.js`
- `npm run regression`
- `git diff --check`
