# 开发者指南

本文档面向希望在 cc-web-enhance 上做贡献的开发者。

---

## 环境搭建

```bash
git clone https://github.com/6Leokk/cc-web-enhance.git
cd cc-web-enhance
npm install
npm start
```

---

## 常用命令

```bash
npm start                       # 启动服务
npm run regression              # 完整回归测试（推送前必跑）
npm run regression:ui           # UI 回归测试
node scripts/<name>-regression.js   # 运行单个回归测试
npm run regression:<short-name> # 通过别名运行
```

---

## 代码检查

没有单独的 lint 或构建步骤。回归测试中包含 `node --check` 对 JS 文件的静态检查。

```bash
node --check server.js
node --check lib/agent-runtime.js
```

---

## 测试约定

每个行为对应一个 `scripts/<name>-regression.js` 文件：

1. 通过 `net.createServer().listen(0)` 分配空闲端口
2. 通过环境变量指向临时目录：
   - `CC_WEB_CONFIG_DIR` / `CC_WEB_SESSIONS_DIR` / `CC_WEB_LOGS_DIR`
   - `CLAUDE_PATH` / `CODEX_PATH` → `scripts/mock-claude.js` / `scripts/mock-codex.js`
3. 作为子进程启动 `node server.js`
4. 通过 WebSocket 客户端驱动交互
5. 断言行为正确
6. 清理子进程

添加功能时，**先写回归测试**。回归链按 CI 顺序执行，失败则停止。

Mock CLI 在 `scripts/mock-claude.js` 和 `scripts/mock-codex.js` 中维护。**不要**在测试中调用真实的 `claude` / `codex`。

---

## 回归测试快捷别名（示例）

以下别名定义在 `package.json` 中，方便运行单个测试：

| 命令 | 类别 |
|------|------|
| `npm run regression:ui` | UI 回归 |
| `npm run regression:auth-ip` | IP 认证 |
| `npm run regression:frp-builtin` | frp 隧道 |
| `npm run regression:ngrok-manager` | ngrok 隧道 |
| `npm run regression:session-navigation` | 会话导航 |
| `npm run regression:port-safety` | 端口安全 |
| `npm run regression:deploy` | 部署脚本 |
| `npm run regression:notify` | 消息通知 |

完整列表参见 `package.json` 的 `scripts` 字段。

---

## 修改指南

### 添加新 Agent

所有 Agent 调度通过 `lib/agent-runtime.js` 的 `createAgentRuntime(deps)` 处理：

- 添加 spawn 参数
- 添加事件解析器
- 添加转录写入器
- 在 `server.js` 的 dispatch 表中注册新的 `set_mode` 值

**不要在** `server.js` 的每个调用点分支。

### 添加新 WebSocket 消息类型

在 `server.js` 的 `wss.on('connection', ...)` 中添加 `case` 分支。

**注意**：dispatch 表没有抽象层，直接添加 case 即可。

### 修改配置系统

- 运行时配置通过 `config/access.json` 存储
- 环境变量覆盖配置文件
- 新增配置段时参考 `get_*` / `save_*` 模式

### 持久化新状态

使用 `CC_WEB_CONFIG_DIR` / `CC_WEB_SESSIONS_DIR` / `CC_WEB_LOGS_DIR` 等环境变量获取目录路径。

新增环境变量用于目录覆盖时，必须同步更新回归测试。

---

## 安全注意事项

- 不提交真实 token、IP、域名到示例中
- `frp/bin/`、`frp/conf/`、`frp/logs/`、`frp/run/`、`frp/tmp/` 已加入 `.gitignore`
- 不要通过修改默认绑定地址来暴露服务，应使用 `lib/access-manager.js` 中的隧道提供程序
