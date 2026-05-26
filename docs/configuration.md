# 配置参考

本文档列出 cc-web-enhance 的所有配置方式：环境变量、配置文件、运行时重配置。

---

## 访问模式配置

### 配置文件：config/access.json

```json
{
  "mode": "direct",
  "scope": "local",
  "publicUrl": "",
  "trustProxy": false
}
```

| 字段 | 可选值 | 说明 |
|------|--------|------|
| `mode` | `direct`, `public`, `ngrok`, `frp` | 访问模式 |
| `scope` | `local`, `lan`, `public`, `auto` | 直连范围（仅 direct 模式有效） |
| `publicUrl` | URL 字符串 | 自定义公网 URL（仅 public 模式） |
| `trustProxy` | `true` / `false` | 是否信任 X-Forwarded-For 头 |

### 环境变量覆盖

配置文件中的值可被环境变量覆盖：

| 环境变量 | 覆盖字段 |
|----------|----------|
| `CC_WEB_ACCESS_MODE` | `mode` |
| `CC_WEB_ACCESS_SCOPE` | `scope` |
| `CC_WEB_PUBLIC_URL` | `publicUrl` |
| `CC_WEB_TRUST_PROXY` | `trustProxy` |

### 运行时重配置

在浏览器中通过设置面板修改，或通过 WebSocket 消息：

```json
{ "type": "save_access", ... }
```

同时提供交互式命令行向导：

```bash
npm run reconfigure
```

---

## 服务配置

### 环境变量

| 环境变量 | 默认值 | 说明 |
|----------|--------|------|
| `CC_WEB_HOST` | `127.0.0.1` | 监听地址 |
| `CC_WEB_PORT` | `8083` | 监听端口 |
| `HOST` | — | 兼容：`CC_WEB_HOST` 的 fallback |
| `PORT` | — | 兼容：`CC_WEB_PORT` 的 fallback |

> 如需监听 LAN（如 0.0.0.0），应设置 `scope=lan` 而非修改 `CC_WEB_HOST`。推荐通过 frp/ngrok 暴露到公网。

---

## 目录配置

| 环境变量 | 默认值 | 说明 |
|----------|--------|------|
| `CC_WEB_CONFIG_DIR` | `./config` | 配置目录 |
| `CC_WEB_SESSIONS_DIR` | `./sessions` | 会话数据目录 |
| `CC_WEB_LOGS_DIR` | `./logs` | 日志目录 |
| `CC_WEB_PUBLIC_DIR` | `./public` | 静态文件目录 |

---

## Agent 路径配置

| 环境变量 | 默认值 | 说明 |
|----------|--------|------|
| `CLAUDE_PATH` | `claude` (PATH) | Claude Code 可执行文件路径 |
| `CODEX_PATH` | `codex` (PATH) | Codex CLI 可执行文件路径 |
| `CODEX_CLI_PATH` | — | Codex CLI 备用路径 |
| `CC_WEB_CODE_MODEL` | — | Codex 使用的模型标识 |
| `CC_WEB_CODE_TEMPERATURE` | — | Codex 温度参数 |

---

## 认证与安全

| 环境变量 / 配置 | 说明 |
|-----------------|------|
| `CC_WEB_AUTH_IP_WHITELIST` | IP 白名单（逗号分隔 CIDR） |
| `CC_WEB_AUTH_PASSWORD` | 简单密码认证 |
| `CC_WEB_QJPG_TOKEN` | 快速登录 token |

---

## frp 配置

参见 [frp 部署说明](./deploy-frp.md)。

环境变量前缀：`FRP_*`

| 环境变量 | 说明 |
|----------|------|
| `FRP_MODE` | 是否启用托管 frp |
| `FRP_SERVER_ADDR` | frp 服务器地址 |
| `FRP_SERVER_PORT` | frp 服务器端口 |
| `FRP_TOKEN` | frp 认证 token |

---

## ngrok 配置

| 环境变量 | 说明 |
|----------|------|
| `NGROK_AUTHTOKEN` | ngrok 认证 token |
| `NGROK_DOMAIN` | 自定义域名（可选） |
| `NGROK_REGION` | 区域（默认 `us`） |

---

## 配置优先级

环境变量 > 配置文件 (`config/access.json`) > 默认值

重新配置通过 WebSocket 保存时写入配置文件，下次启动自动加载。
