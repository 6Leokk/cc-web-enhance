# CC-Web Enhance

Claude Code / Codex 的浏览器远程控制面板。它把本机 CLI Agent 包成一个轻量 Web 工作台，让你可以在电脑、手机或远程入口里创建会话、续接任务、查看历史，并让长任务在浏览器关闭后继续运行。

![Node.js](https://img.shields.io/badge/Node.js-18+-339933?logo=node.js&logoColor=white)
![License](https://img.shields.io/badge/License-See%20NOTICE-lightgrey)

[English README](./README.en.md) | [更新日志](./CHANGELOG.md) | [来源与许可说明](./NOTICE.md)

## 这不是上游 README 的换皮

本仓库是 [`ZgDaniel/cc-web`](https://github.com/ZgDaniel/cc-web) 的增强版 fork，仓库地址是 [`6Leokk/cc-web-enhance`](https://github.com/6Leokk/cc-web-enhance)。README 按当前增强版重新组织，不再沿用上游项目的安装叙事。

增强版重点是：

- 同时支持 Claude Code 和 Codex CLI
- 会话切换、刷新恢复、后台任务和历史导入更可靠
- 默认只监听本机，远程访问必须显式开启
- 提供 ngrok、frp、公网服务器、局域网等访问模式
- 提供国内网络部署脚本，但不污染宿主机 npm 配置
- 增加回归脚本覆盖会话、访问模式、静态资源、Codex rollout 等关键路径

## 适合谁

- 想用浏览器或手机控制本机 Claude Code / Codex 的个人用户
- 希望关闭浏览器后任务继续跑、完成后收到通知的用户
- 想在家里电脑、局域网设备、VPS 或无公网 IP 机器上运行同一套工具的用户
- 想保留 CLI Agent 原生工作流，但需要一个远程 Web 入口的开发者

## 国内主机一键安装

前提：目标机器已安装 `git`、`Node.js >= 18` 和 `npm`。脚本不会自动安装系统包，也不会执行 `npm config set`。

默认安装并启动：

```bash
curl -fsSL https://raw.githubusercontent.com/6Leokk/cc-web-enhance/main/scripts/install-cn.sh | bash -s -- --start
```

如果 raw.githubusercontent.com 访问不稳定，可以使用代理入口：

```bash
curl -fsSL https://gh-proxy.com/https://raw.githubusercontent.com/6Leokk/cc-web-enhance/main/scripts/install-cn.sh | bash -s -- --start
```

默认安装目录：

```text
/opt/cc-web-enhance
```

目录用途：

```text
/opt/cc-web-enhance/          项目代码
/opt/cc-web-enhance/.env      本机环境配置，不提交
/opt/cc-web-enhance/config/   登录、通知、Codex 等运行配置
/opt/cc-web-enhance/sessions/ 会话记录
/opt/cc-web-enhance/logs/     运行日志
/opt/cc-web-enhance/frp/      frp 二进制、配置、日志和 pid
```

更换安装目录：

```bash
curl -fsSL https://raw.githubusercontent.com/6Leokk/cc-web-enhance/main/scripts/install-cn.sh | CC_WEB_INSTALL_DIR=/data/cc-web-enhance bash -s -- --start
```

安装但不启动：

```bash
curl -fsSL https://raw.githubusercontent.com/6Leokk/cc-web-enhance/main/scripts/install-cn.sh | bash
cd /opt/cc-web-enhance
npm start
```

同时准备内置 frp：

```bash
curl -fsSL https://raw.githubusercontent.com/6Leokk/cc-web-enhance/main/scripts/install-cn.sh | bash -s -- --with-frp
```

一键脚本内部会调用 `scripts/install-cn.sh`，再进入仓库执行 `scripts/deploy/linux-cn.sh`。大陆部署 preset 使用本次命令参数安装依赖，等价于：

```bash
npm install --registry=https://registry.npmmirror.com
```

它默认带 `--reset`，会删除 `node_modules`、`frp/bin`、`frp/tmp` 后重新安装；不会删除 `.env`、`config/`、`sessions/`、`logs/`、`frp/conf/`。如果要保留已有安装产物：

```bash
bash scripts/deploy/linux-cn.sh --no-reset
```

Windows 用户在仓库目录内使用：

```cmd
scripts\deploy\windows-cn.cmd
```

## 手动安装

Linux / macOS：

```bash
git clone https://github.com/6Leokk/cc-web-enhance.git
cd cc-web-enhance
npm install
cp .env.example .env
npm start
```

Windows：

```cmd
git clone https://github.com/6Leokk/cc-web-enhance.git
cd cc-web-enhance
npm install
copy .env.example .env
node server.js
```

启动后打开：

```text
http://127.0.0.1:8083
```

首次未设置密码时，服务会在控制台打印随机初始密码，并要求首次登录后修改。

## 远程访问怎么选

默认模式是本机访问：`CC_WEB_ACCESS_MODE=direct` + `CC_WEB_DIRECT_SCOPE=local`，服务只监听 `127.0.0.1:8083`。

| 场景 | 推荐模式 | 说明 |
|------|----------|------|
| 只在本机浏览器使用 | 默认 direct/local | 不需要额外配置 |
| 同一局域网手机访问 | direct/lan | 只给可信 Wi-Fi / LAN 使用 |
| 无公网 IP 远程访问 | ngrok | 最适合个人用户快速外网访问 |
| 已有 VPS / frps | frp | 自托管高级路径 |
| 公网服务器部署 | public | 建议放在 HTTPS 反代和防火墙之后 |

最快 ngrok 启动方式：

```bash
npm run start:ngrok
```

纯命令行配置：

```bash
npm run start:ngrok -- --token YOUR_NGROK_AUTHTOKEN
npm run start:ngrok -- --token YOUR_NGROK_AUTHTOKEN --domain YOUR_DOMAIN
npm run start:ngrok -- --token YOUR_NGROK_AUTHTOKEN --basic-auth user:pass
```

frp 自托管路径：

```bash
cp .env.example .env
# 编辑 .env：设置 CC_WEB_ACCESS_MODE=frp，并填写 FRP_* 变量
npm run frp:download
npm run frp:setup
npm start
```

内置 frp 运行产物会放在 `frp/bin/`、`frp/conf/`、`frp/logs/`、`frp/run/` 和 `frp/tmp/`。其中 `frp/conf/` 可能包含真实 token，不要提交。

frp 详细步骤见 [docs/deploy-frp.md](./docs/deploy-frp.md)。

## 常用命令

```bash
npm start                 # 启动 cc-web
npm run start:ngrok       # 配置并启动 ngrok 模式
npm run setup:ngrok       # 只写入 ngrok 配置，不启动
npm run deploy:cn         # 国内依赖安装 preset
npm run deploy:global     # 国际网络依赖安装 preset
npm run frp:download      # 下载并校验 frp
npm run frp:setup         # 生成 frp 配置
npm run frp:start         # 启动 frp
npm run frp:stop          # 停止 frp
npm run regression        # 运行回归脚本
```

## 安全边界

- 默认只监听 `127.0.0.1:8083`
- `.env`、`config/`、`sessions/`、`logs/`、`frp/conf/` 不应提交
- 不要把真实 token、cookie、session、私钥写进 README 或 `.env.example`
- 公网访问建议使用 HTTPS、强密码、防火墙、IP allowlist 或反向代理访问控制
- 不建议裸露 `0.0.0.0:8083` 给公网
- `CC_WEB_TRUST_PROXY=1` 只应在受信任反向代理之后开启
- quick-login 使用 `/#pair=` fragment，不把配对 token 放进 query string

## 文档导航

- [docs/deploy-frp.md](./docs/deploy-frp.md)：frp 自托管部署
- [docs/intranet-access-design.md](./docs/intranet-access-design.md)：访问模式设计
- [docs/security/intranet-access-threat-model.md](./docs/security/intranet-access-threat-model.md)：内网访问威胁模型
- [docs/security/intranet-access-security-review.md](./docs/security/intranet-access-security-review.md)：安全 review 记录
- [CHANGELOG.md](./CHANGELOG.md)：更新记录
- [NOTICE.md](./NOTICE.md)：来源与许可状态

## 来源与许可

本项目是上游 [`ZgDaniel/cc-web`](https://github.com/ZgDaniel/cc-web) 的增强版 fork。仓库保留上游来源说明和 Git 历史，并在 [NOTICE.md](./NOTICE.md) 中记录许可状态。

上游 README 曾显示 MIT badge，但当前未在上游仓库中识别到机器可读的 `LICENSE` 文件。本仓库不额外声明新的许可证。分发、二次开发或商用前，请先确认并遵守上游最新许可声明。

## 致谢

- 感谢上游 `cc-web` 项目提供最初的轻量 Web 控制思路。
- 感谢本项目贡献者和测试者对 Claude / Codex 双 Agent、远程访问、安全默认值和国内部署路径的验证。
