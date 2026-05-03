# Intranet Access Threat Model

## Assets
- `cc-web-enhance` web UI and backend process manager
- Web authentication password and session tokens
- `config/auth.json`, `config/notify.json`, `config/codex.json`
- Local CLI credentials and home directory data
- frp token and any reverse-tunnel configuration
- Public endpoint exposed by `frps`

## Attack Surface
- Public `frps` bind port
- frpc to frps tunnel authentication
- Optional HTTPS reverse proxy in front of frps
- cc-web login and password-change flow
- Any server bind address other than `127.0.0.1`
- Deployment docs and example config files
- Helper scripts that parse local config or probe localhost

## Risks
- Weak or leaked frp token allows unauthorized tunnel use
- Exposing cc-web directly on `0.0.0.0` increases reachability and brute-force risk
- Leaving frps dashboard or management ports open can expose tunnel inventory
- Publishing real IPs, domains, or tokens in examples can create accidental exposure
- A misconfigured reverse proxy can bypass auth or expose the app over plain HTTP
- Scripts that touch `~/.codex` or public services can leak local secrets or create side effects

## Mitigations
- Default cc-web bind stays `127.0.0.1:8083`
- frp examples use placeholders only
- frps dashboard remains off by default
- frpc local target is always `127.0.0.1:8083`
- Deployment docs recommend HTTPS, firewall rules, and access control
- Helper scripts stay local-only and refuse dangerous patterns
- Regression tests scan for secret-shaped strings and unsafe defaults

## Not Doing
- No NAT traversal implementation in this branch
- No automatic tunnel bootstrap or service installation
- No automatic public DNS or certificate provisioning
- No bundled frp binary
- No live public notification or webhook checks
- No authentication bypass or password-reset changes
