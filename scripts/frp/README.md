# frp helper scripts

These scripts are intentionally local-only.

- `check-frp-config.sh` scans frp config files for unsafe defaults and non-placeholder tokens.
- `check-local-cc-web.sh` checks only `http://127.0.0.1:8083/`.

They do not install frp, download binaries, require sudo, edit system services, or access public notification/webhook endpoints.
