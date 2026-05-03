# frp 部署说明

本文档说明如何通过 frp 安全访问内网机器上的 `cc-web-enhance`。

推荐链路：

```text
外部用户 -> 公网入口 -> frps -> frpc -> 127.0.0.1:8083(cc-web-enhance)
```

默认不要把 cc-web 改成公网监听。frpc 只转发到内网机器的 `127.0.0.1:8083`。

## 内置 frp 快速方式
本仓库提供内置 frp 下载、配置生成和进程管理脚本：

```bash
npm run frp:download
npm run frp:setup
npm run frp:start
npm run frp:status
```

生成文件位置：
- `frp/bin/`：官方 Release 下载并 SHA256 校验后的 `frpc`/`frps`
- `frp/conf/`：本地生成的 `frpc.toml`/`frps.toml`，可能包含真实 token
- `frp/logs/`：frp 日志
- `frp/run/`：pid 文件

这些路径均已被 `.gitignore` 忽略。不要把 `frp/conf/*.toml` 复制到仓库提交区。

## 公网机器
1. 克隆仓库并运行 `npm install`。
2. 复制 `.env.example` 为 `.env`。
3. 设置 `FRP_MODE=server`、`FRP_BIND_PORT=7000` 和强 `FRP_TOKEN`。
4. 如使用域名模式，设置 `FRP_VHOST_HTTP_PORT`。
5. 运行 `npm run frp:download`，脚本会从官方 GitHub Release 下载并校验 SHA256。
6. 运行 `npm run frp:setup` 生成 `frp/conf/frps.toml`。
7. 运行 `npm run frp:start` 启动 `frps`，或用 `npm start` 同时托管 cc-web 与 frp。
8. 配置防火墙，仅放行 frp 入口端口和必要的 HTTP/HTTPS 入口。
9. 可选：使用 Nginx/Caddy 在公网入口做 HTTPS 反代。

仍可使用原生 frp 方式：复制 `deploy/frp/frps.example.toml` 到你的运行目录，替换 `YOUR_FRP_TOKEN` 后按官方 frp 方式启动。示例文件只作为安全模板，不包含真实 token。

公网机安全检查：

```bash
bash scripts/frp/check-frp-config.sh deploy/frp/frps.example.toml
```

不要默认开启 frps dashboard。如果确实需要 dashboard，必须放到受限网络后面，并使用强认证。

## 内网机器
1. 启动或准备启动 `cc-web-enhance`。
2. 确认它只监听 `127.0.0.1:8083`。
3. 复制 `.env.example` 为 `.env`。
4. 设置 `FRP_MODE=client`、`FRP_SERVER_ADDR=YOUR_FRP_SERVER_IP`、`FRP_SERVER_PORT=7000` 和强 `FRP_TOKEN`。
5. 公网 IP 端口模式设置 `FRP_TYPE=ip` 和 `FRP_PUBLIC_PORT=YOUR_PUBLIC_PORT`。
6. 域名模式设置 `FRP_TYPE=domain`，并设置 `FRP_CUSTOM_DOMAIN=YOUR_DOMAIN` 或 `FRP_SUBDOMAIN`。
7. 保持 `FRP_LOCAL_IP=127.0.0.1` 和 `FRP_LOCAL_PORT=8083`。
8. 运行 `npm run frp:download`。
9. 运行 `npm run frp:setup` 生成 `frp/conf/frpc.toml`。
10. 运行 `npm start`，服务会在 `FRP_MODE=client` 时自动拉起 `frpc`；也可以用 `npm run frp:start` 单独启动。
11. 从外部访问公网入口。

仍可使用原生 frp 方式：复制 `deploy/frp/frpc.example.toml` 到你的运行目录，替换 `YOUR_FRP_SERVER_IP`、`YOUR_FRP_TOKEN`、`YOUR_PUBLIC_PORT` 或 `YOUR_DOMAIN` 后按官方 frp 方式启动。

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
