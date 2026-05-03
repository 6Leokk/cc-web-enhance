# frp examples for cc-web-enhance

This directory contains placeholder-only frp examples.

Files:
- `frps.example.toml`: public relay config
- `frpc.example.toml`: intranet client config that forwards to `127.0.0.1:8083`

Rules:
- Replace `YOUR_FRP_SERVER_IP`, `YOUR_FRP_TOKEN`, `YOUR_PUBLIC_PORT`, and `YOUR_DOMAIN` before use.
- Do not commit replaced files.
- Keep cc-web listening on `127.0.0.1:8083`.
- Keep the frps dashboard disabled unless separately protected.
- Put HTTPS and access control at the public entry when possible.

Local checks:

```bash
bash scripts/frp/check-frp-config.sh deploy/frp/frps.example.toml deploy/frp/frpc.example.toml
bash scripts/frp/check-local-cc-web.sh
```
