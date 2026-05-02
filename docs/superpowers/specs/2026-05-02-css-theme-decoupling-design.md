# CSS Theme Decoupling Design

## Goal

Reduce theme-related duplication in `public/style.css` and make future themes cheap to add.

The target outcome is not just a smaller file. The important outcome is a clearer dependency direction:

- Theme files define design tokens.
- Component CSS consumes design tokens.
- Component CSS does not know which theme is active.

## Current State

The app currently ships one stylesheet:

- `public/style.css`

`public/index.html` loads that single file. `public/app.js` manages theme selection through `THEME_OPTIONS`, stores the selected value in `localStorage`, and applies the resolved theme to `document.documentElement.dataset.theme`.

There are four effective visual themes:

- `washi`, the default light theme
- `coolvibe`
- `editorial`
- `mono-night`

`system` is a selector option, not a concrete CSS theme. It resolves to `mono-night` when the system prefers dark mode, otherwise to `washi`.

The stylesheet already uses CSS custom properties, but the token layer is too thin. Many component rules still hard-code theme-specific colors, shadows, panel backgrounds, and state colors. Because of that, `coolvibe` and `mono-night` need many `html[data-theme='...'] .component` overrides.

## Problems To Solve

1. Theme-specific selectors are spread across component styling.
2. Base component CSS still contains many hard-coded palette values.
3. Some theme overrides are near the top of the file, while others are much later.
4. Adding a new theme requires inspecting many components, not just defining a palette.
5. The single CSS file is large enough that unrelated layout, chat, settings, modal, theme, and responsive rules compete for attention.

## Non-Goals

This change should not introduce a frontend build step.

Specifically, do not add Sass, PostCSS, Tailwind, bundlers, or generated CSS in this refactor. The project is currently a static public asset app served by Node, and the CSS architecture can be improved without changing that deployment model.

This change should also avoid redesigning the UI. Visual output should remain intentionally close to the current app, especially for `washi`, `coolvibe`, and `mono-night`.

## Proposed Architecture

Keep `public/style.css` as the only stylesheet referenced by `public/index.html`, but turn it into an import-only entrypoint.

Suggested entrypoint:

```css
@import url('https://fonts.googleapis.com/css2?family=Chivo+Mono:wght@400;700;800&display=swap');
@import url('./styles/tokens.css');
@import url('./styles/themes.css');
@import url('./styles/base.css');
@import url('./styles/layout.css');
@import url('./styles/chat.css');
@import url('./styles/components.css');
@import url('./styles/settings.css');
@import url('./styles/modals.css');
@import url('./styles/responsive.css');
```

The exact file names can change during implementation, but the separation should stay responsibility-based.

The external font import must stay before local style imports. `coolvibe` uses `Chivo Mono`, so dropping or moving that import into an unreachable module would cause visible drift.

## File Responsibilities

### `public/styles/tokens.css`

Defines the default token contract and default `washi` values.

This file should contain:

- global dimensions such as sidebar width, header height, input max height, and safe-area values
- font stacks
- semantic surfaces
- semantic text colors
- semantic borders
- semantic shadows
- semantic control colors
- semantic state colors
- default loading overlay tokens

The default theme should live here so an invalid or missing `data-theme` still renders as `washi`.

### `public/styles/themes.css`

Defines only concrete theme overrides:

- `html[data-theme='coolvibe']`
- `html[data-theme='editorial']`
- `html[data-theme='mono-night']`

Theme files should mostly assign CSS custom properties. Component selectors under `html[data-theme='...']` should be treated as exceptions.

Acceptable exceptions:

- `color-scheme: dark` for `mono-night`
- rare browser-specific form-control fixes if token usage cannot solve them

### `public/styles/base.css`

Contains reset, document sizing, `body`, global scrollbar behavior, generic animations, and small utilities such as `[hidden]`.

### `public/styles/layout.css`

Contains app shell rules:

- login overlay and login box
- main `.app`
- sidebar
- chat header
- message scroll container
- input area
- session loading overlay

If this file becomes too broad during implementation, login can be split into `auth.css`.

### `public/styles/chat.css`

Contains chat-specific rules:

- message rows and bubbles
- avatars
- markdown content
- code blocks
- tool calls and tool groups
- assistant/user/system message variants
- typing indicator

### `public/styles/components.css`

Contains reusable or cross-area components:

- command menu
- option picker
- buttons that are not owned by a single area
- attachment chips
- toast notification
- dropdowns
- status chips

### `public/styles/settings.css`

Contains settings UI:

- settings panel and header
- settings fields
- segmented controls
- settings nav cards
- theme picker cards
- assistant display mode controls
- agent context card

### `public/styles/modals.css`

Contains modal and forced-password/import-session surfaces:

- generic modal overlay/panel
- modal fields and actions
- force change password overlay
- import session list

### `public/styles/responsive.css`

Contains media queries that adjust existing rules.

Responsive rules should stay last so they override earlier module rules predictably.

## Token Model

The current variables should be mapped into a more semantic contract. Existing names can remain as compatibility aliases during migration, but new component work should use the semantic names.

Recommended token groups:

```css
:root {
  /* App surfaces */
  --surface-page: #faf6f0;
  --surface-sidebar: #f2ebe2;
  --surface-header: #f2ebe2;
  --surface-panel: #ffffff;
  --surface-popover: rgba(255, 252, 248, 0.98);
  --surface-input: #ffffff;
  --surface-muted: #e9e0d4;
  --surface-card: rgba(255, 249, 242, 0.72);

  /* Text */
  --text-main: #2d1f14;
  --text-subtle: #6b5a4d;
  --text-muted: #9a8b7d;
  --text-on-accent: #ffffff;
  --text-on-danger: #ffffff;

  /* Borders and shadows */
  --border-default: #ddd0c0;
  --border-subtle: rgba(221, 208, 192, 0.9);
  --border-accent: rgba(192, 85, 58, 0.24);
  --shadow-panel: 0 8px 32px rgba(45, 31, 20, 0.12);
  --shadow-popover: 0 18px 40px rgba(45, 31, 20, 0.14);

  /* Brand and controls */
  --accent: #c0553a;
  --accent-hover: #a84530;
  --accent-soft: #f5ddd4;
  --control-bg: var(--surface-muted);
  --control-hover-bg: var(--accent-soft);
  --control-active-bg: var(--accent-soft);

  /* States */
  --success: #5d8a54;
  --danger: #c0553a;
  --info: #5b7ea1;
  --warning: #9a6f14;
  --warning-bg: rgba(232, 190, 92, 0.16);
  --warning-border: rgba(212, 163, 58, 0.28);

  /* Chat */
  --message-user-bg: var(--accent);
  --message-user-text: var(--text-on-accent);
  --message-assistant-bg: #fff9f2;
  --message-assistant-text: var(--text-main);
  --message-system-bg: var(--surface-muted);

  /* Code and tool output */
  --code-header-bg: #2b2b2b;
  --code-header-text: #999999;
  --code-inline-bg: var(--surface-muted);
  --tool-content-bg: var(--surface-page);
  --tool-reasoning-bg: linear-gradient(180deg, rgba(255, 249, 242, 0.92), rgba(245, 221, 212, 0.32));
}
```

This list is intentionally larger than the current token set. The extra tokens replace component-level theme patches.

## Migration Strategy

Implement in small stages so visual regressions are easier to locate.

### Stage 1: Create Structure Without Behavior Change

Create `public/styles/` and split the current stylesheet into files with minimal edits.

This first split should preserve cascade order above everything else. Use continuous source ranges rather than perfect responsibility boundaries if those two goals conflict.

For example, existing late theme overrides should remain later in the cascade until Stage 2 centralizes them. Do not move a late override into an earlier `themes.css` import in Stage 1 if that changes behavior.

At the end of this stage, the app should look the same, but CSS is easier to navigate.

Expected result:

- `public/style.css` is an import entrypoint.
- All original CSS rules still exist, only relocated.
- Regression scripts still pass after they are updated to read imported CSS content.

During this stage, add a small shared regression helper such as `scripts/read-public-css.js` or equivalent inline utility that reads `public/style.css` plus local `@import url('./styles/...')` targets into one combined string. Current regression scripts inspect CSS text directly, so `scripts/theme-regression.js`, `scripts/ui-regression.js`, and `scripts/mobile-scroll-regression.js` must not keep reading only the import entrypoint.

### Stage 2: Centralize Theme Selectors

Move all `html[data-theme='...']` blocks into `themes.css`.

Do not remove them yet. This stage makes the duplication visible in one place and creates a clear rule that theme selectors belong in the theme layer.

Update `scripts/theme-regression.js` to check that `html[data-theme=` only appears in `public/styles/themes.css`, except for the entrypoint if comments or imports mention it.

### Stage 3: Introduce Semantic Tokens

Add semantic tokens in `tokens.css`.

During this stage, preserve old variables as aliases where useful:

```css
--bg-primary: var(--surface-page);
--bg-secondary: var(--surface-sidebar);
--bg-tertiary: var(--surface-muted);
--text-primary: var(--text-main);
--text-secondary: var(--text-subtle);
--border-color: var(--border-default);
--accent-light: var(--accent-soft);
```

Aliases let the refactor proceed without changing every component at once.

The alias list above is illustrative, not complete. Every existing custom property should remain defined until its last consumer has migrated. This includes tokens such as `--bg-bubble-user`, `--bg-bubble-assistant`, `--page-background`, `--login-background`, `--surface-strong`, `--shadow-strong`, `--theme-card-*`, and `--loading-*`.

### Stage 4: Convert Component CSS To Tokens

Replace hard-coded theme colors in component files with semantic tokens.

Start with high-impact areas:

1. panels and popovers
2. buttons and controls
3. chat bubbles
4. status chips and warning notes
5. settings cards
6. modals
7. tool-call/code surfaces

After each area, remove any theme override that became redundant.

### Stage 5: Shrink Theme Overrides

After component rules consume tokens, reduce each concrete theme block to token assignments.

The goal is:

- `editorial` remains token-only
- `coolvibe` becomes token-only or nearly token-only
- `mono-night` keeps `color-scheme: dark` plus token assignments

Any remaining component-level theme override should include a short comment explaining why a token cannot handle it.

### Stage 6: Strengthen Regression Checks

Extend `scripts/theme-regression.js` with static checks:

- `public/style.css` imports the expected style modules
- concrete theme selectors are present in `public/styles/themes.css`
- no `html[data-theme=` selectors appear outside `themes.css`
- no obvious washi palette constants appear in component modules, except allowlisted token definitions

Keep checks simple and deterministic. This should remain a lightweight Node script, not a CSS parser dependency.

Also update CSS-reading assertions in `scripts/ui-regression.js` and `scripts/mobile-scroll-regression.js` to use the same aggregated CSS content. Otherwise those regressions will fail after `public/style.css` becomes an import-only entrypoint even when the runtime CSS is correct.

## Validation

Run existing regressions:

```bash
npm run regression:theme
npm run regression:ui
```

If time allows, run the full regression suite:

```bash
npm run regression
```

Manual browser checks should cover:

- initial load before login
- login overlay
- main chat layout
- settings page
- theme picker
- command menu
- option picker
- modal overlay
- message bubbles
- code blocks
- tool-call blocks
- mobile width under 480px
- `system` theme with light and dark OS preferences if feasible

## Risks

### CSS Import Ordering

`@import` order becomes the cascade contract. The entrypoint must keep tokens first, themes second, component modules next, and responsive rules last.

Stage 1 is the exception: it may use transitional chunk files ordered by original source position to preserve behavior. The responsibility-based order should be reached only after theme overrides and semantic tokens have been migrated enough to make the cascade stable.

### Visual Drift

Replacing hard-coded colors with semantic tokens can subtly change surfaces. Keep stage 1 as a pure move, then migrate one area at a time.

### Over-Tokenization

Too many one-off tokens can become another form of duplication. Add tokens for repeated semantic needs, not for every individual CSS declaration.

### Static Regression False Positives

Simple grep-style checks can flag data URLs, code block colors, or intentionally fixed preview surfaces. Use a small allowlist where fixed colors are genuinely theme-independent.

## Acceptance Criteria

- `public/style.css` is an import-only entrypoint.
- Theme definitions are centralized in `public/styles/themes.css`.
- Component files mostly use semantic tokens instead of hard-coded palette colors.
- `html[data-theme='...'] .component` overrides are removed or justified.
- Adding a new theme primarily requires changes to `public/styles/themes.css` and `THEME_OPTIONS` in `public/app.js`.
- `npm run regression:theme` passes and includes checks for theme selector locality.
- Existing UI remains visually close to the current app across all current themes.
