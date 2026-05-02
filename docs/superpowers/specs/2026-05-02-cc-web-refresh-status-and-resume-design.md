# CC-Web Refresh, Status, And Resume Design

## Goal

Address three user-visible issues in one coordinated pass:

1. Slow page refresh on the same LAN
2. Missing structured model reasoning-effort display in the composer status line
3. Occasional jump to historical messages when returning from another app to the browser

The target outcome is not just a working patch for each symptom. The important outcome is a clearer separation between:

- document shell loading vs. application bootstrap cost
- model identity vs. reasoning-effort metadata
- user scroll intent vs. viewport/layout churn during foreground restoration

## Scope

This design covers:

- HTTP static asset delivery for `index.html`, local JS/CSS/images, and third-party browser assets
- `session_info` and related client/server state for structured model metadata
- mobile foreground restore behavior driven by `visibilitychange`, `pagehide`, `pageshow`, and viewport events

This design does not cover:

- Bark notification logic changes
- a full replication of Codex native live context telemetry if the current CLI event stream does not expose it
- introducing a frontend build toolchain

## Current State

### 1. Refresh Performance

The app is served directly from Node static file responses.

Observed characteristics:

- `index.html` is served with `Cache-Control: no-cache`
- `app.js` is also served with `Cache-Control: no-cache`
- the app currently loads several browser dependencies from public CDNs
- there is no evidence of `ETag`, `Last-Modified`, or content-encoding optimization in the static path

This means a LAN refresh still behaves like a cold start:

- re-request local JS/CSS on every refresh
- block on external CDN fetches
- pay parse/execute cost for the full app bundle even when nothing changed

### 2. Model Display

The current UI status line shows only `session_info.model`.

For Codex, reasoning effort is currently modeled separately:

- user config and runtime config use `model_reasoning_effort`
- Codex rollout and turn context carry `effort` / `reasoning_effort`
- CLI launch still uses base `--model gpt-5.4` plus reasoning config

The UI therefore loses information and displays `gpt-5.4` instead of the user-meaningful `gpt-5.4(xhigh)`.

### 3. Foreground Restore Scroll Jumps

The current restore behavior tries hard to keep the chat at bottom if the user was near bottom before backgrounding.

The logic currently depends on:

- `messagesWereNearBottomBeforeHidden`
- `messagesWereNearBottomBeforeViewportChange`
- `isUserAtMessagesBottom`
- `isNearMessagesBottom()`
- `document.activeElement === msgInput`
- multiple delayed re-anchors after restore

This is robust against many iOS viewport shifts, but it still blends together two different situations:

- the user genuinely intends to stay pinned at bottom
- the browser temporarily reports a misleading viewport/focus state during foreground restoration

That blending can still produce an occasional jump to historical content or an unintended bottom snap.

## Problems To Solve

1. Static asset delivery is too pessimistic for LAN refreshes.
2. CDN dependencies make same-LAN refresh depend on external network conditions.
3. The UI does not receive reasoning-effort as a first-class field.
4. The UI is forced to infer display meaning from incomplete model strings.
5. Foreground restore logic uses a heuristic set that is still too broad.
6. Scroll restore does not fully separate “layout turbulence” from “user intent”.

## Non-Goals

This design should not:

- add Vite/Webpack/esbuild or any other frontend bundler
- redesign the CC-Web visual language
- change Bark behavior unless later evidence shows a real service-side bug
- promise Codex-native live context metrics if the CLI stream does not expose them

## Proposed Architecture

Treat the work as three coordinated but bounded streams.

### Stream A: Refresh Performance

Keep the server-side static app architecture, but make the shell/cache policy more intentional.

Design rules:

- `index.html` remains `no-cache`
  - rationale: it is the shell that should pick up new asset references and deployment changes immediately
- versionable static assets should become cacheable
  - `app.js`
  - `style.css`
  - `public/styles/*`
  - icons/images
- external CDN dependencies should be localized into `public/vendor/`
  - rationale: LAN refresh should not require public internet for critical rendering or bootstrap

Preferred policy:

- `index.html`: `Cache-Control: no-cache`
- stable local assets: `Cache-Control: public, max-age=31536000, immutable` if fingerprinted
- if fingerprinting is not introduced in this pass, use shorter validation-friendly caching plus `ETag`

Recommended implementation direction:

1. Move CDN JS/CSS dependencies into repo-served local files
2. Add validation headers (`ETag` or `Last-Modified`) for local static assets
3. Apply differentiated cache policy between shell and assets
4. Consider response compression after steps 1-3 if payload size still dominates

Why this order:

- localizing CDN dependencies removes the largest source of refresh unpredictability
- caching/validation reduces needless LAN transfers
- compression helps, but only after the first two problems are removed

### Stream B: Structured Model + Reasoning Effort

Model identity and reasoning effort must become separate data fields throughout the app contract.

New conceptual contract:

```json
{
  "model": "gpt-5.4",
  "reasoningEffort": "xhigh"
}
```

Display remains a derived concern:

- if both exist: `gpt-5.4(xhigh)`
- if only model exists: `gpt-5.4`
- if only reasoning effort exists, this is an invalid/incomplete state and should fall back safely

Required server-side sources:

- Codex profile/config parsing
- runtime session metadata
- session persistence/import where reasoning effort is observable

Required client-side updates:

- `normalizeSessionSnapshot`
- session cache shape
- composer status line rendering
- any future model badge or status display should reuse the same formatter

Important constraint:

Do not encode reasoning effort back into `model` as storage truth.
Keep it structured in storage and transport; only join at the display edge.

### Stream C: Foreground Restore Scroll Stability

The fix should narrow the restore contract, not add more retries blindly.

New design principle:

Bottom anchoring should happen only when the app has strong evidence that the user intended to remain at bottom before backgrounding.

That evidence should come primarily from a dedicated captured intent at hide time, not from transient focus/viewport state after restore.

Recommended adjustments:

1. Capture a single explicit foreground-return intent snapshot on hide/pagehide
   - whether user was at bottom
   - whether current restore should re-anchor after visibility return
2. Stop letting broad post-restore heuristics reclassify the user as “should keep bottom” too easily
3. Reduce reliance on `document.activeElement === msgInput` as a strong signal during restore
   - focus can be restored by the browser even when the user did not intend a bottom snap
4. Distinguish:
   - session-switch anchor-to-bottom
   - foreground-return anchor-to-bottom
   - viewport-only resize maintenance
5. Keep the repeated delayed re-anchor only for the explicitly bottom-pinned foreground-return case

Expected effect:

- users who were reading history before backgrounding should stay there
- users who were at bottom before backgrounding should still land back at bottom reliably
- transient viewport jitter should no longer flip one case into the other

## Data Contract Changes

### Session Payload Additions

Add structured fields to `session_info` and cached snapshots:

```json
{
  "model": "gpt-5.4",
  "reasoningEffort": "xhigh",
  "workspaceStatus": {
    "cwd": "/home/kk/code/cc-web",
    "cwdDisplay": "~/code/cc-web",
    "git": {
      "available": true,
      "branch": "main",
      "addedLines": 49,
      "deletedLines": 5,
      "detached": false,
      "taskMode": "local"
    }
  },
  "lastUsage": null,
  "totalUsage": {
    "inputTokens": 108890977,
    "cachedInputTokens": 102894080,
    "outputTokens": 607988
  }
}
```

Notes:

- `reasoningEffort` is the new field needed for correct status display
- `lastUsage` stays nullable because current CLI/runtime streams do not always expose it
- `workspaceStatus.cwdDisplay` remains the display-ready path source

### Static Asset Delivery Contract

The static file server should differentiate shell from assets:

- `index.html` is always revalidated
- assets are cacheable and/or fingerprinted
- no critical browser dependency should require public CDN availability

## Testing Strategy

### Refresh Performance

Add or extend regression checks for:

- local HTML shell keeps `no-cache`
- local JS/CSS assets use improved cache/validation headers
- `index.html` references local vendor files instead of public CDN URLs

Manual verification:

- first load from LAN
- second refresh from LAN
- compare observed request waterfall before/after

### Structured Model / Reasoning Effort

Add regression checks for:

- server-side structured field presence
- client-side snapshot normalization
- display formatter producing `model(reasoningEffort)` when both fields exist

### Foreground Restore

Add regression checks for:

- hide-time intent capture remains explicit
- restore path does not use overly broad heuristics to reclassify bottom intent
- session-refresh-after-foreground still uses the owned load path

Manual verification:

- stay at bottom, background app, return
- scroll up into history, background app, return
- return during active generation
- return after generation completes in background

## Risks

1. Aggressive asset caching without fingerprinting can cause stale JS/CSS after deploy
2. Localizing vendor assets increases repo-managed asset surface
3. Reasoning-effort may be observable in some flows but not others; imported/legacy sessions need a safe null path
4. Over-tightening foreground restore logic may regress the “keep at bottom” fix for users who actually want bottom anchoring

## Recommended Implementation Order

1. Structured `reasoningEffort` field end-to-end
2. Foreground restore logic tightening with regression coverage
3. Static asset caching/local vendor work

Why this order:

- `reasoningEffort` is a contained correctness fix with clear truth sources
- foreground restore is a known behavioral bug and benefits from focused regression work
- refresh optimization is larger and easier to do safely once the user-facing correctness issues are stabilized

## Acceptance Criteria

1. A Codex session configured as `gpt-5.4 + xhigh` renders in the status line as `gpt-5.4(xhigh)`
2. The app transport and persistence layer store reasoning effort as a separate field from model
3. Returning from another app while reading historical messages no longer unexpectedly snaps the view to the wrong place
4. Returning from another app while previously pinned at bottom still restores a stable bottom view
5. LAN refresh no longer depends on public CDN availability for critical bootstrap assets
6. LAN refresh performs fewer or smaller avoidable asset transfers on repeated reloads
