# frp 部署说明

## 公网机器
1. 安装 `frps`。
2. 复制 `deploy/frp/frps.example.toml`。
3. 替换 `YOUR_FRP_TOKEN`。
4. 启动 `frps`。
5. 配置防火墙，仅放行需要的端口。
6. 可选：在 `frps` 前面加 Nginx 或 Caddy 做 HTTPS 反代。

## 内网机器
1. 启动 `cc-web-enhance`。
2. 确认它只监听 `127.0.0.1:8083`。
3. 安装 `frpc`。
4. 复制 `deploy/frp/frpc.example.toml`。
5. 替换 `YOUR_FRP_SERVER_IP` 和 `YOUR_FRP_TOKEN`。
6. 启动 `frpc`。
7. 从外部访问公网入口。

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
- 不要在仓库中保存真实 token
- 不要把 cc-web 改成默认 `0.0.0.0`
- 不要直接公开 `frps` dashboard
