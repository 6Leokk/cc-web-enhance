# frp 配置模板

这个目录只放可提交的 frp 示例配置，用来说明 `cc-web-enhance` 的自托管远程访问方式。

文件：

- `frps.example.toml`：公网中继机示例配置
- `frpc.example.toml`：内网机器示例配置，默认转发到 `127.0.0.1:8083`

使用规则：

- 复制示例文件到你自己的运行目录后再填写真实值
- 替换 `YOUR_FRP_SERVER_IP`、`YOUR_FRP_TOKEN`、`YOUR_PUBLIC_PORT`、`YOUR_DOMAIN`
- 不要把替换后的配置提交到 Git
- cc-web 本体建议继续监听 `127.0.0.1:8083`
- frps dashboard 默认不要开放；确需启用时必须放在受限网络和强认证之后
- 公网入口建议加 HTTPS、Basic Auth、IP allowlist 或防火墙规则

本地检查：

```bash
bash scripts/frp/check-frp-config.sh deploy/frp/frps.example.toml deploy/frp/frpc.example.toml
bash scripts/frp/check-local-cc-web.sh
```

完整步骤见 [docs/deploy-frp.md](../../docs/deploy-frp.md)。
