# cc-web-enhance 内网远程访问设计

## 背景
`cc-web-enhance` 是 `cc-web` 的增强 fork。目标是让内网机器上的 `cc-web-enhance` 能被外部安全访问，同时保持本地默认只监听 `127.0.0.1:8083`。

## 推荐架构
- 内网机器：`cc-web-enhance` + `frpc`
- 公网 VPS / 中继机：`frps`
- 外部用户：访问公网入口，再由 frp 转发回内网 `127.0.0.1:8083`

推荐默认保持：
- `cc-web` 本体只监听 `127.0.0.1:8083`
- frp 只做转发，不改变 cc-web 默认监听地址

## frp 方案说明
### TCP 暴露模式
适合最直接的端口转发。用户通过公网 IP + 端口访问，适合快速验证。

### HTTP 域名模式
适合绑定域名并让 `frps` 根据域名路由到内网服务。可配合 Nginx/Caddy 做 HTTPS。

### HTTPS 反代模式
推荐在公网入口前再放一层反代，负责 TLS、基础访问控制和日志。

### 推荐部署方式
第一阶段推荐 `frps` + `frpc` + HTTPS 反代。这样可控、好排障、易写文档，也便于后续替换 tunnel provider。

## 安全边界
- cc-web 自身必须启用认证
- frp token 必须强且不写入仓库
- 公网入口建议加 HTTPS
- 建议增加防火墙、IP allowlist、Basic Auth、反代访问控制
- 不建议直接裸露 frp dashboard 或管理端口
- 不建议把 cc-web 改成 `0.0.0.0`
- 不允许提交真实 token、cookie、session、auth header

## 替代方案比较
- frp：稳定、可控、部署简单，适合第一阶段
- ssh reverse tunnel：简单但易受会话中断影响，适合临时访问
- cloudflared tunnel：免公网 VPS，但依赖外部平台策略
- Tailscale：体验好，但更偏组网，不是直接公网入口
- ZeroTier：类似 Tailscale，适合专网访问
- WebRTC/P2P NAT 打洞：理论上灵活，但复杂度高，不适合作为第一阶段默认实现

## 推荐结论
第一阶段使用 frp。理由是稳定、可控、配置简单、测试容易、部署门槛低。P2P NAT 打洞暂不作为默认实现，但可在后续通过 tunnel provider 抽象扩展。

## 后续扩展设计
建议未来抽象一个轻量 provider 层：
- `frp`
- `ssh`
- `cloudflared`
- `tailscale`
- `zerotier`
- `p2p/webrtc`

该层只描述能力和配置，不负责自动安装或自动申请外部资源。
