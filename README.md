# CC-Web Enhance

浏览器管理 Claude Code / Codex CLI 的轻量 Web 控制台。支持后台续跑、历史导入、远程访问（frp / ngrok），默认仅本地 `127.0.0.1:8083`。

![Node.js](https://img.shields.io/badge/Node.js-18+-339933?logo=node.js&logoColor=white)
![License](https://img.shields.io/badge/License-MIT%20/%20See%20NOTICE-blue)

[English](./README.en.md) | [更新日志](./CHANGELOG.md) | [来源说明](./NOTICE.md)

## 一键部署

要求：`git`、`Node.js >= 18`、`npm` 已安装。

### Windows

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -Command "& ([scriptblock]::Create((irm 'https://raw.githubusercontent.com/6Leokk/cc-web-enhance/main/scripts/install-cn.ps1?v=2'))) -Start"
```

<details>
<summary>网络不稳定？用镜像代理命令</summary>

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -Command "`$s=try{irm 'https://raw.githubusercontent.com/6Leokk/cc-web-enhance/main/scripts/install-cn.ps1?v=2' -TimeoutSec 15}catch{irm 'https://gh-proxy.com/https://raw.githubusercontent.com/6Leokk/cc-web-enhance/main/scripts/install-cn.ps1?v=2' -TimeoutSec 15}; & ([scriptblock]::Create(`$s)) -Start"
```
</details>

### Linux / macOS

```bash
curl -fsSL https://raw.githubusercontent.com/6Leokk/cc-web-enhance/main/scripts/install-cn.sh?v=2 | bash -s -- --start
```

<details>
<summary>网络不稳定？用镜像代理命令</summary>

```bash
(curl -fsSL --connect-timeout 15 https://raw.githubusercontent.com/6Leokk/cc-web-enhance/main/scripts/install-cn.sh?v=2 || curl -fsSL https://gh-proxy.com/https://raw.githubusercontent.com/6Leokk/cc-web-enhance/main/scripts/install-cn.sh?v=2) | bash -s -- --start
```
</details>

### 带 ngrok 一键部署

```bash
# Linux — ngrok + 自定义密码（或不传 --password 自动生成）
curl -fsSL ...install-cn.sh?v=2 | bash -s -- --start --token <ngrok-token> --password <password>
```

```powershell
# Windows
powershell ... -Token <ngrok-token> -Password <password> -Start
```

> 安装脚本内置镜像自动切换 — gh-proxy 代理和 npmmirror npm 镜像均为自动 fallback，无需手动配置。

安装目录：Windows `%LOCALAPPDATA%\cc-web-enhance`，Linux/macOS `/opt/cc-web-enhance`（需 sudo 权限，可自定义：`CC_WEB_INSTALL_DIR=/path bash`）。
安装完成后自动启动，浏览器打开 `http://127.0.0.1:8083` 即可使用。

## 重置配置

删除 `.env` 后重跑配置向导（切换访问模式、ngrok token 等）：

```bash
# Linux / macOS
rm -f /opt/cc-web-enhance/.env && cd /opt/cc-web-enhance && npm run reconfigure

# Windows
Remove-Item -Force "$env:LOCALAPPDATA\cc-web-enhance\.env" -ErrorAction SilentlyContinue
cd "$env:LOCALAPPDATA\cc-web-enhance"
npm run reconfigure
```

也可以直接 `npm run reconfigure`（不删 `.env` 也能重配）。

## 常用命令

```bash
npm start                 # 启动
npm run reconfigure       # 交互式重配（访问模式、ngrok token 等）
npm run start:ngrok       # 一键配置并启动 ngrok
npm run frp:download      # 下载 frp 二进制
npm run frp:setup         # 渲染 frp 配置
npm run regression        # 运行回归测试
```

## 核心功能

- **多 Agent** — Claude Code 和 Codex CLI 在同一工作台切换
- **后台续跑** — 关浏览器任务继续，刷新即恢复
- **远程访问** — frp / ngrok 隧道、LAN 共享，默认仅本地
- **安全默认** — 仅监听 127.0.0.1，密码认证、IP 白名单
- **移动端适配** — 响应式 UI，手机也能用

## 文档

| 主题 | 链接 |
|------|------|
| 配置参考 | [docs/configuration.md](./docs/configuration.md) |
| 远程访问 | [docs/remote-access.md](./docs/remote-access.md) |
| 系统架构 | [docs/architecture.md](./docs/architecture.md) |
| 开发者指南 | [docs/development.md](./docs/development.md) |
| WebSocket 协议 | [docs/websocket-protocol.md](./docs/websocket-protocol.md) |
| frp 部署 | [docs/deploy-frp.md](./docs/deploy-frp.md) |
| 用量统计 | [docs/testing-usage-telemetry.md](./docs/testing-usage-telemetry.md) |

## 许可证

基于 [ZgDaniel/cc-web](https://github.com/ZgDaniel/cc-web) 的增强 fork，详见 [NOTICE.md](./NOTICE.md)。
