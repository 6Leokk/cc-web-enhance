# Findings & Decisions

## Requirements
- Add safe intranet remote access for `cc-web-enhance`, frp-first.
- Keep default bind local-only.
- Add `CC_WEB_HOST` and `CC_WEB_PORT`.
- Default host must be `127.0.0.1`.
- Default port must be `8083`.
- Add frp example configs and deployment docs.
- Add helper scripts that are local-only and non-invasive.
- Add regression tests and safety scans.
- Keep secret values, tokens, and real public endpoints out of the repo.

## Research Findings
- `server.js` currently reads `HOST` and `PORT`, not `CC_WEB_HOST` / `CC_WEB_PORT`.
- The repo default port in code and docs is still `8002`.
- Local workspace `.env` already uses `PORT=8083`, so the runtime expectation in this workspace is already different from the repo default.
- `README.md` and `README.en.md` both tell users to use `HOST=0.0.0.0` for LAN access; that needs to be replaced with frp guidance.
- Existing regression scripts use isolated temp dirs and random ports, which is a good pattern to extend.
- No deploy/frp directory exists yet.
- No branch progress file exists yet.

## Technical Decisions
| Decision | Rationale |
|----------|-----------|
| Add a dedicated config helper for bind resolution | Keeps validation testable without booting the server on a fixed port |
| Keep old `HOST` / `PORT` support | Preserves backward compatibility for existing local setups and regression scripts |
| Make frp example files placeholder-only | Prevents real IP, token, or domain leakage |
| Use shell scripts that only inspect local files and localhost | Keeps safety checks offline and deterministic |

## Issues Encountered
| Issue | Resolution |
|-------|------------|
| `rg` missing | Used `grep`, `find`, and `git ls-files` instead |

## Resources
- `server.js`
- `README.md`
- `README.en.md`
- `scripts/regression.js`
- `scripts/notify-regression.js`
- `scripts/port-safety-regression.js`
- `scripts/auth-ip-regression.js`

## Visual/Browser Findings
- None.
