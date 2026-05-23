# 内置 frp 运行目录

这个目录由 `cc-web-enhance` 的内置 frp 工具使用。仓库只提交这个说明文件；真实运行产物都应留在本机。

运行时目录：

- `frp/bin/`：下载并校验后的 `frpc` / `frps` 二进制和 checksum
- `frp/conf/`：`npm run frp:setup` 生成的本机配置，可能包含真实 token
- `frp/logs/`：frp 进程日志
- `frp/run/`：frp pid 文件
- `frp/tmp/`：下载和解压临时目录

这些路径已被 `.gitignore` 忽略。不要提交 frp 二进制、真实配置、日志或 token。

常用命令：

```bash
npm run frp:download
npm run frp:setup
npm run frp:start
npm run frp:status
npm run frp:stop
```
