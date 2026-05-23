# cc-web-enhance 内网远程访问设计

## 背景
`cc-web-enhance` 是 `cc-web` 的增强 fork。目标是给本机、局域网、公网服务器、无公网远程访问和自托管隧道提供统一访问模式，同时保持默认只监听 `127.0.0.1:8083`。

## 访问模式

统一入口变量：

```env
CC_WEB_ACCESS_MODE=direct
CC_WEB_DIRECT_SCOPE=local
```

模式说明：

| 用户目标 | 配置 | 说明 |
|---------|------|------|
| 本机网页访问 | `direct` + `local` | 默认值，只开放 `127.0.0.1` |
| 同一局域网访问 | `direct` + `lan` | 面向同一 Wi-Fi / 同一可信局域网设备 |
| 公网服务器访问 | `public` | 不启动隧道，适合 VPS 或自管反向代理 |
| 无公网下远程访问 | `ngrok` | 内置 ngrok provider，转发到本机 loopback 服务 |
| 自托管隧道 | `frp` | 保留给已有 frps/VPS 的高级用户 |

默认只有 `direct` + `local` 是零配置路径。`direct/lan`、`public`、`ngrok`、`frp` 都需要用户显式选择。`CC_WEB_HOST` / `CC_WEB_PORT` 仍控制 Node 服务监听地址。

## 推荐架构
小用户优先路径：
- 本机使用：保持默认 `direct` + `local`
- 同一网络设备访问：选择 `direct` + `lan`
- 没有公网 IP 的远程访问：选择 `ngrok`，填写 `NGROK_AUTHTOKEN`
- 公网服务器或反向代理：选择 `public`，配置 `CC_WEB_PUBLIC_URL`

自托管 frp 路径：
- 内网机器：`cc-web-enhance` + `frpc`
- 公网 VPS / 中继机：`frps`
- 外部用户：访问公网入口，再由 frp 转发回内网 `127.0.0.1:8083`

推荐默认保持：
- `cc-web` 本体只监听 `127.0.0.1:8083`
- ngrok/frp 只转发到本机 loopback，不改变 cc-web 默认监听地址

## quick-login 边界
quick-login 是一次性、短有效期的配对链接。链接必须使用根路径 fragment：

```text
/#pair=<token>
```

不要把配对 token 放到 query string。裸 `public` HTTP 默认禁用 quick-login；需要公网 quick-login 时应先使用 HTTPS 或受控反向代理。quick-login 不绕过首次登录强制改密。

## ngrok 运行方式
`ngrok` 适合没有公网 IP、也不想自建 frps 的个人远程访问。典型配置：

```env
CC_WEB_ACCESS_MODE=ngrok
NGROK_AUTHTOKEN=YOUR_NGROK_AUTHTOKEN
NGROK_AUTO_START=1
```

可选项：
- `NGROK_DOMAIN`：固定 ngrok 域名
- `NGROK_BASIC_AUTH`：ngrok Basic Auth，格式 `user:pass`
- `NGROK_AUTO_START=0`：禁止 `npm start` 自动启动 ngrok

ngrok upstream 必须是 `http://127.0.0.1:<CC_WEB_PORT>`，不要转发到 `0.0.0.0`。

## 内置 frp 运行方式
frp 保留为自托管高级路径。本分支将 frp 的下载校验、配置生成和进程管理集成到仓库脚本中。用户仍需要提供自己的公网 frps 地址和强 token，但不需要手动查找 frp Release、解压二进制或手写最小配置。

推荐用户流：

```bash
cp .env.example .env
# 编辑 .env：设置 CC_WEB_ACCESS_MODE=frp，并填写 FRP_* 变量
npm run frp:download
npm run frp:setup
npm start
```

大陆网络下可使用部署 preset，脚本不会修改宿主机 npm 配置：

```bash
bash scripts/deploy/linux-cn.sh --with-frp
bash scripts/deploy/macos-cn.sh --with-frp
scripts\deploy\windows-cn.cmd --with-frp
```

大陆 preset 使用本次命令的 `npm install --registry=https://registry.npmmirror.com`，并通过 `FRP_DOWNLOAD_GITHUB_PROXY_BASE` 给 frp Release 资源下载增加代理前缀。完全镜像化 frp 下载时必须提供 `FRP_DOWNLOAD_BASE_URL` 或 `FRP_DOWNLOAD_URL`，并同时提供 `FRP_VERSION` 与 `FRP_DOWNLOAD_SHA256`。

运行目录：

```text
frp/
  bin/   # 官方 Release 下载并 SHA256 校验后的 frpc/frps
  conf/  # npm run frp:setup 生成的本地配置，可能包含真实 token
  logs/  # frpc/frps stdout/stderr
  run/   # pid 文件
```

`frp/bin/`、`frp/conf/`、`frp/logs/`、`frp/run/` 和 `frp/tmp/` 均被 `.gitignore` 忽略。兼容旧配置：如果未设置 `CC_WEB_ACCESS_MODE`，但存在 `FRP_MODE=client` 或 `FRP_MODE=server`，访问模式按 `frp` 处理；`FRP_AUTO_START=0` 可禁用自动启动。

## frp 方案说明
### TCP 暴露模式
适合最直接的端口转发。用户通过公网 IP + 端口访问，适合快速验证。

### HTTP 域名模式
适合绑定域名并让 `frps` 根据域名路由到内网服务。可配合 Nginx/Caddy 做 HTTPS。

### HTTPS 反代模式
推荐在公网入口前再放一层反代，负责 TLS、基础访问控制和日志。

### 推荐部署方式
第一阶段推荐内置 `frpc` + 公网 `frps` + HTTPS 反代。公网机器也可以用本仓库的 `FRP_MODE=server` 生成并管理 `frps`，但仍建议将公网入口放在防火墙和反代访问控制之后。这样可控、好排障、易写文档，也便于后续替换 tunnel provider。

## 安全边界
- cc-web 自身必须启用认证
- 默认模式必须保持 local-only
- 任何 LAN、公网或隧道暴露都必须由用户显式选择
- quick-login 链接必须使用 `/#pair=` fragment，不能使用 query string
- 裸 `public` HTTP 默认禁用 quick-login
- `0.0.0.0` 不能作为浏览器可打开 URL 展示
- `CC_WEB_TRUST_PROXY=1` 只能在受信任反向代理之后手动开启
- ngrok/frp upstream 建议保持 `127.0.0.1:8083`
- frp token 必须强且不写入仓库
- 公网入口建议加 HTTPS
- 建议增加防火墙、IP allowlist、Basic Auth、反代访问控制
- 不建议直接裸露 frp dashboard 或管理端口
- 不建议把 cc-web 改成 `0.0.0.0`
- 不允许提交真实 token、cookie、session、auth header
- 不允许把 `frp/conf/*.toml`、`frp/bin/*` 或 frp 日志提交到仓库

## 替代方案比较
- ngrok：适合无公网 IP 的个人远程访问，配置少，但依赖外部服务
- frp：稳定、可控、部署简单，适合第一阶段
- ssh reverse tunnel：简单但易受会话中断影响，适合临时访问
- cloudflared tunnel：免公网 VPS，但依赖外部平台策略
- Tailscale：体验好，但更偏组网，不是直接公网入口
- ZeroTier：类似 Tailscale，适合专网访问
- WebRTC/P2P NAT 打洞：理论上灵活，但复杂度高，不适合作为第一阶段默认实现

## 推荐结论
默认保持本机访问。无公网远程访问优先使用 ngrok；frp 保留为自托管高级路径。P2P NAT 打洞暂不作为默认实现，但可在后续通过 tunnel provider 抽象扩展。

## 后续扩展设计
建议未来抽象一个轻量 provider 层：
- `ngrok`
- `frp`
- `ssh`
- `cloudflared`
- `tailscale`
- `zerotier`
- `p2p/webrtc`

该层只描述能力和配置，不负责自动安装或自动申请外部资源。
