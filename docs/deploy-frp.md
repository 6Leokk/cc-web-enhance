# frp 部署说明

本文档说明如何通过 frp 安全访问内网机器上的 `cc-web-enhance`。

推荐链路：

```text
外部用户 -> 公网入口 -> frps -> frpc -> 127.0.0.1:8083(cc-web-enhance)
```

默认不要把 cc-web 改成公网监听。frpc 只转发到内网机器的 `127.0.0.1:8083`。

## 公网机器
1. 安装 `frps`。
2. 复制 `deploy/frp/frps.example.toml` 到你的运行目录。
3. 替换 `YOUR_FRP_TOKEN` 为强 token。
4. 按你的运行方式启动 `frps`。
5. 配置防火墙，仅放行 frp 入口端口和必要的 HTTP/HTTPS 入口。
6. 可选：开启 HTTP 域名模式时，替换 `YOUR_DOMAIN` 并只开放受控入口。
7. 可选：使用 Nginx/Caddy 在公网入口做 HTTPS 反代。

公网机安全检查：

```bash
bash scripts/frp/check-frp-config.sh deploy/frp/frps.example.toml
```

不要默认开启 frps dashboard。如果确实需要 dashboard，必须放到受限网络后面，并使用强认证。

## 内网机器
1. 启动 `cc-web-enhance`。
2. 确认它只监听 `127.0.0.1:8083`。
3. 安装 `frpc`。
4. 复制 `deploy/frp/frpc.example.toml` 到你的运行目录。
5. 替换 `YOUR_FRP_SERVER_IP` 和 `YOUR_FRP_TOKEN`。
6. 如使用 TCP 模式，替换 `YOUR_PUBLIC_PORT`。
7. 如使用 HTTP 域名模式，替换 `YOUR_DOMAIN` 并启用对应 proxy 配置。
8. 启动 `frpc`。
9. 从外部访问公网入口。

内网机安全检查：

```bash
bash scripts/frp/check-local-cc-web.sh
bash scripts/frp/check-frp-config.sh deploy/frp/frpc.example.toml
```

## TCP 模式
TCP 模式适合快速验证。外部用户访问公网机器的 `YOUR_PUBLIC_PORT`，frp 转发到内网 `127.0.0.1:8083`。

注意：
- `YOUR_PUBLIC_PORT` 需要在公网机器防火墙中放行。
- cc-web 认证必须开启。
- 建议只允许可信来源 IP 访问该端口。

## HTTP 域名模式
HTTP 域名模式适合通过 `YOUR_DOMAIN` 访问。启用 `frps.example.toml` 中的 `vhostHTTPPort` 注释配置，并在 `frpc.example.toml` 中启用 HTTP proxy 示例。

注意：
- `YOUR_DOMAIN` 必须解析到公网机器。
- 建议前置 HTTPS。
- 不要把真实域名提交到仓库。

## HTTPS 反代建议
公网机器可以用 Nginx/Caddy 终止 TLS，并反代到 frp 暴露的本地入口。示意：

```nginx
server {
    listen 443 ssl;
    server_name YOUR_DOMAIN;

    location / {
        proxy_pass http://127.0.0.1:YOUR_PUBLIC_PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }
}
```

还可以在反代层增加 Basic Auth、IP allowlist、访问日志和限速。

## 验证步骤
- `curl http://127.0.0.1:8083/`
- 查看 `frpc` 日志
- 查看 `frps` 日志
- 从外部访问公网入口
- 确认 cc-web 认证开启
- 确认公网未暴露 frp dashboard
- 确认没有把 token 提交到 git

## 安全建议
- 生产环境优先使用 HTTPS
- cc-web 必须启用自身认证
- frp token 必须足够强
- 不要在仓库中保存真实 token
- 不要把 cc-web 改成默认 `0.0.0.0`
- 不要直接公开 `frps` dashboard
- 不要提交真实公网 IP、真实域名、cookie、session 或 auth header
