# cc-web-enhance Notice

`cc-web-enhance` is an enhanced derivative of:

- Upstream project: `ZgDaniel/cc-web`
- Upstream URL: https://github.com/ZgDaniel/cc-web

This repository preserves the upstream project history in Git and documents the upstream source in the README files. The enhancement work in this repository focuses on local deployment safety, refresh performance, session navigation reliability, Codex rollout telemetry, static asset delivery, and regression coverage.

## License Status

The upstream README displays an MIT license badge, but the upstream GitHub repository currently does not expose a machine-readable `LICENSE` file through GitHub license metadata. For that reason, this repository does not add a new license claim on top of the upstream project.

Before redistributing or using this repository outside your own account, review the upstream repository's latest licensing statement and preserve any copyright, license, and attribution notices required by upstream.

## Sensitive Files

Runtime secrets and local state must stay out of Git:

- `.env`
- `.env.*` except `.env.example`
- `.npmrc`
- `config/`
- `sessions/`
- `logs/`
- `attachments/`
- private key files such as `*.pem`, `*.key`, `id_rsa`, and `id_ed25519`
