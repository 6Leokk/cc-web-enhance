# Built-in frp runtime directory

This directory is used by the built-in frp tooling.

Generated runtime paths are ignored by git:
- `frp/bin/` downloaded `frpc` / `frps` binaries and checksum records
- `frp/conf/` generated runtime config
- `frp/logs/` process logs
- `frp/run/` pid files
- `frp/tmp/` temporary download/extract workspace

Do not commit generated configs or binaries.
