# 远程访问指南

本文档介绍如何通过不同方式远程访问 cc-web-enhance。

---

## 访问模式概览

cc-web-enhance 支持四种访问模式：

| 模式 | 适用场景 | 复杂度 |
|------|----------|--------|
| **direct** | 本地或 LAN 访问 | 低 |
| **public** | 有公网 IP 的服务器 | 低 |
| **ngrok** | 无公网 IP，快速启用隧道 | 中 |
| **frp** | 自托管隧道，完全控制 | 高 |

默认模式：`direct` + `scope=local`，仅监听 `127.0.0.1:8083`。

---

## 本地访问（默认）

无需配置，直接访问：

```
http://127.0.0.1:8083
```

---

## LAN 访问

如果需要让同一局域网内的其他设备访问：

```bash
# 方法 1：设置 scope
CC_WEB_ACCESS_SCOPE=lan npm start

# 方法 2：修改配置
npm run reconfigure
# 选择 direct 模式，scope 设置为 lan
```

---

## ngrok 隧道（推荐新手）

适合快速分享给他人，无需复杂配置。

### 前提条件

- 注册 [ngrok](https://ngrok.com) 账号并获取 authtoken
- 可选：升级账号以获得自定义域名

### 配置

```bash
# 方法 1：环境变量
NGROK_AUTHTOKEN=<your-token> npm start

# 方法 2：通过向导
npm run reconfigure
# 选择 ngrok 模式，输入 authtoken
```

### 自定义域名（可选）

```bash
NGROK_DOMAIN=<your-domain> npm start
```

---

## frp 隧道（高级用户）

适合需要完全控制隧道配置的场景。

详细部署说明参见：[frp 部署说明](./deploy-frp.md)

### 快速开始

```bash
# 1. 下载 frp 二进制
npm run frp:download

# 2. 配置（交互式向导）
npm run reconfigure
# 选择 frp 模式，输入服务器地址和 token

# 3. 渲染配置文件
npm run frp:setup

# 4. 启动
npm run frp:start
```

### 命令参考

| 命令 | 说明 |
|------|------|
| `npm run frp:download` | 下载官方 frp 二进制并校验 SHA256 |
| `npm run frp:setup` | 根据环境变量渲染 frpc.toml |
| `npm run frp:start` | 启动 frp 客户端 |
| `npm run frp:stop` | 停止 frp 客户端 |
| `npm run frp:status` | 查看 frp 状态 |

---

## 公网直接绑定

如果你有公网 IP，可以直接监听所有接口：

```bash
# ⚠️ 确保配置了认证！
CC_WEB_ACCESS_MODE=public \
CC_WEB_ACCESS_SCOPE=public \
CC_WEB_AUTH_PASSWORD=<strong-password> \
npm start
```

**安全警告**：公网暴露时必须配置认证！

---

## 安全建议

1. **不要修改默认绑定地址**，应使用 frp/ngrok 隧道
2. **公网暴露时必须配置认证**（IP 白名单或密码）
3. 使用 `npm run reconfigure` 向导避免手动配置错误
4. 生产环境建议使用 systemd 管理服务

---

## 配置文件

访问模式配置存储在 `config/access.json`：

```json
{
  "mode": "direct",
  "scope": "local",
  "publicUrl": "",
  "trustProxy": false
}
```

详见 [配置参考](./configuration.md)。
