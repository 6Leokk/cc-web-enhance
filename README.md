# CC-Web Enhance

Claude Code / Codex 轻量级 Web 远程工具增强版 — 在浏览器中与本机 CLI Agent 交互。

![Node.js](https://img.shields.io/badge/Node.js-22+-339933?logo=node.js&logoColor=white)
![License](https://img.shields.io/badge/License-See%20NOTICE-lightgrey)

[English README](./README.en.md) | [更新日志](./CHANGELOG.md) | [来源与许可说明](./NOTICE.md)

本仓库是 [ZgDaniel/cc-web](https://github.com/ZgDaniel/cc-web) 的增强整理版本，目标是保留原项目轻量远程控制 Claude Code / Codex CLI 的使用方式，同时补强刷新性能、会话切换可靠性、Codex rollout 解析、静态资源交付和回归覆盖。

## 来源与许可

- 上游项目：[`ZgDaniel/cc-web`](https://github.com/ZgDaniel/cc-web)
- 增强版仓库：`cc-web-enhance`
- 本仓库保留上游来源说明和致谢；详细说明见 [NOTICE.md](./NOTICE.md)。
- 上游 README 显示 MIT badge，但 GitHub license metadata 当前未识别到上游 `LICENSE` 文件。本仓库不额外声明新的许可证；分发和二次开发前请确认并遵守上游最新许可声明。

## 一键部署：Claude / Codex
```
https://github.com/6Leokk/cc-web-enhance 给我装！
```


<p align="center">
  <img src="https://github.com/user-attachments/assets/ae974fcd-b6a7-4bdf-8553-bfcf2e7038a4" alt="截图1" width="30%" />
  <img src="https://github.com/user-attachments/assets/eb0291c1-2b38-4379-9a07-8eecc6c87d8f" alt="截图2" width="30%" />
  <img src="https://github.com/user-attachments/assets/09cec007-a949-44cf-9f2a-88c1eda60082" alt="截图3" width="30%" />
</p>


## 功能特性

- **超轻量** — 后端性能占用少，前端通过 web 访问
- **多会话管理** — 创建、切换、重命名、删除会话，删除时同步清除本地 Claude 历史记录
- **本地历史导入** — Claude 可导入 `~/.claude/projects/` 会话；Codex 可导入 `~/.codex/sessions/` rollout 历史
- **后台任务** — 关闭浏览器后 Claude 进程继续运行，完成后推送通知，支持 PushPlus / Telegram / Server酱 / 飞书机器人 / QQ（Qmsg）/ Bark
- **多 API 切换** — 可配置多个 API 方案，一键切换，即时生效
- **开发者配置** — 可保存主机SSH信息、github token，实现快速管理远程主机、管理github仓库
- **增强稳定性** — 增加会话懒加载、刷新缓存、事件作用域隔离和多条回归脚本，降低刷新慢、串会话和状态栏滞后的风险

## 前提条件

- **Node.js** >= 18
- **Claude Code CLI** 或 **Codex CLI** 已安装并配置
  ```bash
  npm install -g @anthropic-ai/claude-code
  npm install -g @openai/codex
  ```

## 快速开始

### Linux / macOS

```bash
git clone https://github.com/6Leokk/cc-web-enhance.git
cd cc-web-enhance
npm install
cp .env.example .env    # 可选，不设密码则首次启动自动生成
npm start
```

### Windows

```cmd
git clone https://github.com/6Leokk/cc-web-enhance.git
cd cc-web-enhance
npm install
copy .env.example .env  & REM 可选
```
然后双击 `start.bat`，或在终端运行 `node server.js`。

---

启动后访问 `http://127.0.0.1:8083`，输入密码即可使用。

## 一键部署脚本

仓库提供国际版和大陆版部署 preset。脚本只影响当前命令，不会执行 `npm config set`，也不会修改宿主机的全局 npm 镜像源或用户 `.npmrc`。

这些一键脚本默认带 `--reset`，会先删除 `node_modules`、`frp/bin`、`frp/tmp`，再重新安装依赖和下载需要的 frp 文件；不会删除 `.env`、`frp/conf`、日志或用户配置。这样下载中断或依赖安装半失败后，用户直接重跑同一个脚本即可恢复。确实要保留当前安装产物时，可直接运行 `node scripts/deploy.js --profile cn --no-reset` 或 `node scripts/deploy.js --profile global --no-reset`。

国际版使用 npm 默认源和官方 frp Release 路径：

```bash
bash scripts/deploy/linux-global.sh
bash scripts/deploy/macos-global.sh
```

```cmd
scripts\deploy\windows-global.cmd
```

大陆版默认用本次命令参数安装依赖，等价于 `npm install --registry=https://registry.npmmirror.com`，并在 frp 下载时默认注入 GitHub Release 资源代理：

```bash
bash scripts/deploy/linux-cn.sh
bash scripts/deploy/macos-cn.sh
```

```cmd
scripts\deploy\windows-cn.cmd
```

如果需要同时准备 frp，给任一脚本追加 `--with-frp`。如果要启动服务，再追加 `--start`。完全镜像化 frp 下载时，可传入 `--frp-download-base-url`、`--frp-version` 和 `--frp-download-sha256`；缺少 SHA256 时脚本会拒绝直接镜像下载。

## 访问模式 / 远程访问

默认模式是 `CC_WEB_ACCESS_MODE=direct` + `CC_WEB_DIRECT_SCOPE=local`，服务只监听 `127.0.0.1:8083`，只允许本机浏览器访问。任何超出本机的访问方式都需要显式选择。

最快的 ngrok 启动方式：

```bash
npm run start:ngrok
```

首次运行会在终端提示粘贴 ngrok authtoken，并可选填写固定 domain 和 Basic Auth。脚本会自动把 `.env` 切到 `CC_WEB_ACCESS_MODE=ngrok`、保持 `CC_WEB_HOST=127.0.0.1`、开启 `NGROK_AUTO_START=1`，然后启动 cc-web。后续再运行同一命令会复用 `.env` 里的配置。只想配置不启动时运行：

完全通过终端参数配置也可以，不需要交互提示：

```bash
npm run start:ngrok -- --token YOUR_NGROK_AUTHTOKEN
npm run start:ngrok -- --token YOUR_NGROK_AUTHTOKEN --domain YOUR_DOMAIN
npm run start:ngrok -- --token YOUR_NGROK_AUTHTOKEN --basic-auth user:pass
```

也可以只通过环境变量传入：

```bash
NGROK_AUTHTOKEN=YOUR_NGROK_AUTHTOKEN npm run start:ngrok
```

只想配置不启动时运行：

```bash
npm run setup:ngrok
```

常用模式：

| 使用场景 | 配置 | 说明 |
|---------|------|------|
| 本机网页访问 | `CC_WEB_ACCESS_MODE=direct` + `CC_WEB_DIRECT_SCOPE=local` | 默认值，只显示本机 URL |
| 同一局域网访问 | `CC_WEB_ACCESS_MODE=direct` + `CC_WEB_DIRECT_SCOPE=lan` | 面向同一 Wi-Fi / 同一可信局域网设备 |
| 公网服务器直连 | `CC_WEB_ACCESS_MODE=public` | 适合 VPS 或用户自管反向代理；建议使用 HTTPS 和访问控制 |
| 无公网下远程访问 | `CC_WEB_ACCESS_MODE=ngrok` + `NGROK_AUTHTOKEN` | 适合没有公网 IP 的个人机器，内置 ngrok provider 会转发到本机 loopback 服务 |
| 自托管高级路径 | `CC_WEB_ACCESS_MODE=frp` 或兼容 `FRP_MODE=client/server` | 适合已有 frps/VPS 的用户 |

小用户流程：启动后打开设置，选择本机、局域网、无公网下远程访问、公网服务器或 frp；当界面给出 QR/quick-login 链接时，可以扫码或复制链接登录。quick-login 使用 `/#pair=` fragment，不把配对 token 放进 query string；裸 public HTTP 默认禁用 quick-login。

## frp 自托管部署

frp 保留为高级自托管路径。默认仍不要把 cc-web 改成公网监听；frpc 应转发到内网机器的 `127.0.0.1:8083`。如果只需要无公网远程访问，优先考虑上面的 `ngrok` 模式。

本仓库内置 frp 下载、配置生成和进程管理，不需要手动下载 frp：

```bash
cp .env.example .env
# 编辑 .env：设置 CC_WEB_ACCESS_MODE=frp，填写 FRP_SERVER_ADDR、FRP_SERVER_PORT、FRP_TOKEN，并选择 FRP_TYPE=ip 或 domain
npm run frp:download
npm run frp:setup
npm start
```

兼容旧配置：如果未设置 `CC_WEB_ACCESS_MODE`，但 `FRP_MODE=client` 或 `FRP_MODE=server` 存在，访问模式会按 `frp` 处理。`npm start` 会在 `FRP_AUTO_START=1` 且 frp 模式启用时自动启动对应的 `frpc`/`frps`。也可以单独使用 `npm run frp:start`、`npm run frp:stop`、`npm run frp:status` 管理 frp 进程。生成的二进制、配置、日志和 pid 文件位于 `frp/`，其中 `frp/bin/`、`frp/conf/`、`frp/logs/`、`frp/run/` 均已被 `.gitignore` 忽略。

详细步骤见 [frp 部署说明](./docs/deploy-frp.md)，架构与替代方案见 [内网远程访问设计](./docs/intranet-access-design.md)。

## 配置

### 环境变量 (.env)

| 变量 | 必填 | 默认值 | 说明 |
|------|:---:|--------|------|
| `CC_WEB_PASSWORD` | 否 | 自动生成 | Web 登录密码（首次启动自动迁移到 `config/auth.json`） |
| `CC_WEB_PORT` | 否 | `8083` | 服务监听端口 |
| `CC_WEB_HOST` | 否 | `127.0.0.1` | 服务监听地址；`direct/local`、`ngrok`、`frp` 模式建议保持默认 |
| `CC_WEB_ACCESS_MODE` | 否 | `direct` | 访问模式：`direct` / `public` / `ngrok` / `frp` |
| `CC_WEB_DIRECT_SCOPE` | 否 | `local` | `direct` 模式作用域：`local` / `lan` |
| `CC_WEB_PUBLIC_URL` | 否 | - | public 或反代场景的公开 origin；只填 `https://host[:port]`，不要带 path/query/hash |
| `CC_WEB_TRUST_PROXY` | 否 | `0` | 仅在受信任反向代理之后运行时设为 `1` |
| `PORT` | 否 | - | 兼容旧变量；`CC_WEB_PORT` 优先 |
| `HOST` | 否 | - | 兼容旧变量；`CC_WEB_HOST` 优先 |
| `NGROK_AUTHTOKEN` | `ngrok` 必填 | - | ngrok authtoken；只写入本地 `.env`，不要提交 |
| `NGROK_DOMAIN` | 否 | - | 可选的 ngrok 固定域名 |
| `NGROK_BASIC_AUTH` | 否 | - | 可选的 ngrok Basic Auth，格式 `user:pass` |
| `NGROK_AUTO_START` | 否 | `1` | 设为 `0` 时禁止 `npm start` 自动启动 ngrok |
| `FRP_MODE` | 否 | `disabled` | 兼容旧变量；未设置 `CC_WEB_ACCESS_MODE` 且为 `client`/`server` 时按 `frp` 模式处理 |
| `FRP_TYPE` | 否 | `ip` | 客户端穿透类型：公网 IP 端口模式 `ip`，或域名模式 `domain` |
| `FRP_SERVER_ADDR` | frp client 必填 | `YOUR_FRP_SERVER_IP` | 公网 frps 地址，占位符需要替换 |
| `FRP_SERVER_PORT` | 否 | `7000` | frps 连接端口 |
| `FRP_TOKEN` | frp 启用时必填 | `YOUR_FRP_TOKEN` | frp 强 token；只写入本地 `.env`，不要提交 |
| `FRP_PUBLIC_PORT` | `FRP_TYPE=ip` 时必填 | `YOUR_PUBLIC_PORT` | 公网 TCP 访问端口 |
| `FRP_CUSTOM_DOMAIN` | `FRP_TYPE=domain` 时可填 | `YOUR_DOMAIN` | HTTP 域名模式的完整域名 |
| `FRP_SUBDOMAIN` | 否 | - | HTTP 域名模式的 frp subdomain |
| `FRP_BIND_PORT` | server 模式可填 | `7000` | frps bindPort |
| `FRP_VHOST_HTTP_PORT` | server 域名模式可填 | - | frps HTTP vhost 端口 |
| `FRP_LOCAL_IP` | 否 | `127.0.0.1` | frpc 转发到的本地地址；建议保持默认 |
| `FRP_LOCAL_PORT` | 否 | `8083` | frpc 转发到的本地端口 |
| `FRP_AUTO_START` | 否 | `1` | 设为 `0` 时禁止 `npm start` 自动启动 frp |
| `FRP_CONFIG_FILE` | 否 | `frp/conf/frpc.toml` 或 `frp/conf/frps.toml` | 生成/读取的 frp 配置路径 |
| `FRP_EXTRA_TOML_FILE` | 否 | - | 追加原生 frp TOML 的本地文件路径 |
| `FRP_DOWNLOAD_GITHUB_PROXY_BASE` | 否 | - | frp 官方 Release 资源下载代理前缀；大陆部署脚本默认注入 |
| `FRP_DOWNLOAD_BASE_URL` | 否 | - | frp 镜像 base，按 `<base>/v<version>/<asset>` 下载 |
| `FRP_DOWNLOAD_URL` | 否 | - | frp 完整镜像压缩包 URL |
| `FRP_DOWNLOAD_SHA256` | 直接镜像下载必填 | - | 直接镜像下载时用于校验 frp 压缩包 |
| `FRP_VERSION` | 直接镜像下载必填 | - | 直接镜像下载时选择 frp 版本 |
| `CLAUDE_PATH` | 否 | `claude` | Claude CLI 可执行文件路径 |
| `CODEX_PATH` | 否 | `codex` | Codex CLI 可执行文件路径 |
| `CC_WEB_CONFIG_DIR` | 否 | `./config` | 配置目录覆写（主要供隔离测试使用） |
| `CC_WEB_SESSIONS_DIR` | 否 | `./sessions` | 会话目录覆写（主要供隔离测试使用） |
| `CC_WEB_LOGS_DIR` | 否 | `./logs` | 日志目录覆写（主要供隔离测试使用） |
| `PUSHPLUS_TOKEN` | 否 | - | PushPlus Token（首次启动自动迁移到通知配置） |
| `BARK_DEVICE_KEY` | 否 | - | Bark Device Key（首次启动自动迁移到通知配置） |
| `BARK_SERVER_URL` | 否 | `https://api.day.app` | Bark 服务地址，支持自建服务 |
| `BARK_GROUP` | 否 | `CC-Web` | Bark 通知分组 |
| `BARK_LEVEL` | 否 | `active` | Bark 通知级别：`active` / `timeSensitive` / `passive` |
| `BARK_SOUND` | 否 | - | Bark 铃声名称 |
| `BARK_ICON` | 否 | - | Bark 通知图标 URL |
| `BARK_URL` | 否 | - | Bark 通知点击跳转 URL |

`.env` 已在 `.gitignore` 中，不会上传到 GitHub；不要把真实 Token 写进 `.env.example` 或 README。

### 通知配置

点击侧边栏底部的 **⚙ 设置按钮**，在 Web UI 中可视化配置推送通知：

| 通知方式 | 所需配置 | 获取方式 |
|---------|---------|---------|
| **PushPlus**（微信推送） | Token | [pushplus.plus](https://www.pushplus.plus/) 注册获取 |
| **Telegram** | Bot Token + Chat ID | [@BotFather](https://t.me/BotFather) 创建机器人 |
| **Server酱** | SendKey | [sct.ftqq.com](https://sct.ftqq.com/) 注册获取 |
| **飞书机器人** | Webhook URL | 飞书群 → 设置 → 群机器人 → 添加自定义机器人 |
| **QQ（Qmsg）** | Qmsg Key | [qmsg.zendee.cn](https://qmsg.zendee.cn/) 登录后获取，需添加接收 QQ 号 |
| **Bark**（iOS） | Server URL + Device Key | iPhone 安装 Bark 后复制 Key；默认服务为 `https://api.day.app`，也支持自建服务 |

配置保存在 `config/notify.json`，Token 在 UI 中脱敏显示（仅显示前4后4位）。

### 密码管理

密码存储在 `config/auth.json`，支持自动生成与 Web UI 修改：

- **首次启动**（无 `.env` 密码、无 `auth.json`）：自动生成 12 位随机密码，打印到控制台，首次登录强制修改
- **从 `.env` 迁移**：如已在 `.env` 设置 `CC_WEB_PASSWORD`，启动时自动迁移到 `auth.json`，无需改密
- **Web UI 修改**：设置面板 → 修改密码（需输入当前密码）
- **密码要求**：≥ 8 位，包含大写/小写/数字/特殊字符中的至少 2 种
- **改密后**：所有已登录会话失效，需重新认证

## 项目结构

```
cc-web/
├── server.js              # Node.js 后端（HTTP + WebSocket + 进程管理 + 通知）
├── lib/
│   ├── agent-runtime.js    # Claude / Codex 运行时适配层
│   ├── codex-rollouts.js   # Codex rollout 历史解析
│   ├── frp-config.js       # 内置 frp 配置生成
│   └── frp-manager.js      # 内置 frp 进程管理
├── frp/                    # frp 运行目录（bin/conf/logs/run 均为本地生成并忽略）
├── public/
│   ├── index.html          # 页面结构
│   ├── app.js              # 前端逻辑（WebSocket 通信、UI 交互）
│   ├── style.css           # 样式（和风暖色调主题）
│   └── sw.js               # Service Worker（移动端推送通知）
├── config/
│   ├── codex.json          # Codex 独立配置（运行时生成）
│   ├── notify.json         # 通知渠道配置（运行时生成）
│   └── auth.json           # 密码配置（运行时生成）
├── sessions/               # 对话历史 JSON 文件（运行时生成）
├── logs/                   # 进程生命周期日志（运行时生成）
├── scripts/
│   ├── regression.js       # 隔离式回归脚本
│   ├── mock-claude.js      # 回归用 mock Claude CLI
│   ├── mock-codex.js       # 回归用 mock Codex CLI
│   ├── frp-download.js     # 官方 frp Release 下载与 SHA256 校验
│   ├── frp-setup.js        # 生成本地 frp/conf/*.toml
│   └── frp-control.js      # frp start/stop/status 管理命令
├── .env.example            # 环境变量模板
├── start.bat               # Windows 一键启动脚本
├── .gitignore
├── package.json
└── README.md
```

## 架构设计

### 进程模型

```
浏览器 ←WebSocket→ Node.js (server.js) ←文件I/O→ Claude / Codex CLI (detached)
```

- 每条用户消息会根据当前会话 Agent，spawn Claude 或 Codex 子进程
- 进程使用 `detached: true` + `proc.unref()`，独立于 Node.js 生命周期
- stdin/stdout/stderr 通过文件传递（`sessions/{id}-run/`），不使用 pipe
- PID 持久化到文件，服务重启后自动恢复（`recoverProcesses()`）
- 使用 `FileTailer` 实时监听输出文件变化，流式推送给前端
- Claude / Codex 的 spawn spec 与事件解析分别由 `lib/agent-runtime.js` 管理

### 后台任务流程

1. 用户发送消息 → spawn Claude 进程
2. 用户关闭浏览器 → 进程继续运行（detached）
3. 进程完成 → PID 监控检测到退出
4. 发送推送通知（PushPlus/Telegram/...）
5. 用户重新打开 → 自动同步完成的回复

### 进程日志

日志文件 `logs/process.log`（JSONL 格式，自动轮转 2MB），记录完整的进程生命周期：

| 事件 | 说明 |
|------|------|
| `process_spawn` | 进程创建（PID、模式、模型） |
| `process_complete` | 进程完成（退出码、耗时、费用） |
| `ws_connect` / `ws_disconnect` | 客户端连接/断开 |
| `ws_resume_attach` | 客户端重连并挂载到运行中的进程 |
| `recovery_alive` / `recovery_dead` | 服务重启时恢复进程 |
| `heartbeat` | 每 60 秒活跃进程状态快照 |

查看日志：
```bash
tail -f logs/process.log | jq .
```

## 生产部署

部署前建议先确认本地验证通过：

```bash
npm run regression
npm run regression:ui
```

安全注意：

- 不要提交 `.env`、`config/`、`sessions/`、`logs/`、`attachments/`、`.npmrc` 或私钥文件。
- 默认只监听 `127.0.0.1:8083`。需要公网访问时，优先使用 frp、Tailscale、Cloudflare Tunnel 或 Nginx 反向代理，并限制来源 IP。
- 不建议把 cc-web 直接改成 `0.0.0.0`。如果用户显式这样做，必须确认密码足够强，且防火墙只允许可信设备访问。

### systemd 服务

创建 `/etc/systemd/system/cc-web-enhance.service`：

```ini
[Unit]
Description=CC-Web Enhance - Claude Code / Codex Web UI
After=network.target

[Service]
Type=simple
User=your-user
WorkingDirectory=/path/to/cc-web-enhance
ExecStart=/usr/bin/node server.js
Restart=on-failure
RestartSec=5
# 重要：只杀 Node.js 进程，不杀 Claude 子进程
KillMode=process

[Install]
WantedBy=multi-user.target
```

> **`KillMode=process` 非常重要**：确保 systemd 重启服务时只杀 Node.js 进程，Claude 子进程继续运行，服务恢复后自动重新挂载。

```bash
sudo systemctl daemon-reload
sudo systemctl enable cc-web-enhance
sudo systemctl start cc-web-enhance
sudo systemctl status cc-web-enhance --no-pager -l
```

### Nginx 反向代理

```nginx
server {
    listen 443 ssl;
    server_name your-domain.com;

    ssl_certificate     /path/to/fullchain.pem;
    ssl_certificate_key /path/to/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:8083;
        proxy_http_version 1.1;

        # WebSocket 支持
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;

        # 长连接超时（Claude 任务可能运行较久）
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }
}
```

### Windows 部署

适用于在个人电脑上运行 CC-Web，通过手机远程控制 Claude Code。

**启动方式**：双击 `start.bat`，或在终端运行：
```cmd
cd cc-web-enhance
npm install
node server.js
```

**局域网访问**（手机和电脑在同一 WiFi）：
- 出于安全考虑，CC-Web 默认只监听 `127.0.0.1`，推荐通过 Nginx 等反向代理、Tailscale 或 Cloudflare Tunnel 暴露访问入口，并配合防火墙限制来源。
- 确需在局域网内使用，可显式设置 `CC_WEB_HOST=0.0.0.0`，但更推荐按 [frp 部署说明](./docs/deploy-frp.md) 保持 `127.0.0.1:8083` 并通过受控入口访问。

**远程访问**（外出时用手机控制家里电脑）：
- 推荐使用 [frp 部署说明](./docs/deploy-frp.md) 中的 frp 方案，或使用 Tailscale / Cloudflare Tunnel 等受控隧道方案。


## 更新记录

查看 [CHANGELOG.md](./CHANGELOG.md)

## 致谢

- 本项目得到 [@carroxaitech](https://github.com/carroxaitech)、[@YoungHong1992](https://github.com/YoungHong1992)的悉心指导，得到[@123aliez](https://github.com/123aliez)的算力支持，[@lytxsy](https://github.com/lytxsy)的深度测试，受益良多
- 项目亦得到[linux.do](https://linux.do)启发
