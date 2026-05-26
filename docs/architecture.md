# 系统架构

本文档描述 cc-web 的整体架构、核心组件和关键设计决策。

---

## 总览

```
┌─────────────┐     WebSocket      ┌─────────────┐     文件管道     ┌─────────────────┐
│   Browser   │ ◄─────────────────► │  server.js  │ ◄──────────────► │ Claude/Codex CLI │
│  (public/)  │                    │  (主进程)    │                  │   (分离子进程)    │
└─────────────┘                    └─────────────┘                  └─────────────────┘
                                         │
                    ┌────────────────────┼────────────────────┐
                    │                    │                    │
              ┌─────▼─────┐      ┌──────▼──────┐     ┌──────▼──────┐
              │ agent-     │      │ access-     │     │ frp/ngrok   │
              │ runtime.js │      │ manager.js  │     │ manager.js  │
              └───────────┘      └─────────────┘     └─────────────┘
```

---

## 核心组件

### server.js

主入口，约 2800 行。职责：

- HTTP 静态文件服务（`public/` 目录）
- WebSocket 连接管理和消息分发
- 子进程生命周期管理（spawn / recover / heartbeat）
- 会话持久化（`sessions/` 目录）
- 配置读写（`config/` 目录）

### lib/ 模块

| 模块 | 职责 |
|------|------|
| `agent-runtime.js` | Agent 适配层：生成 spawn 参数、流式事件解析、转录写入、工具调用塑形 |
| `access-config.js` | 解析 `config/access.json` + 环境变量为 `AccessConfig` 对象 |
| `access-manager.js` | 协调访问模式（direct / public / ngrok / frp），驱动隧道管理器 |
| `access-network.js` | LAN/本地 URL 发现，IPv6 通配符处理 |
| `access-auth-ip.js` | IP/身份白名单认证 |
| `server-config.js` | 解析监听地址和端口，LAN 绑定建议 |
| `frp-manager.js` | frp 隧道生命周期管理（子进程） |
| `ngrok-manager.js` | ngrok 隧道生命周期管理（SDK） |
| `frp-config.js` | 渲染 `frpc.toml` / `frps.toml` 配置 |
| `claude-transcript.js` | 解析 Claude JSONL 转录文件（历史导入） |
| `codex-rollouts.js` | 解析 Codex rollout JSONL |
| `codex-telemetry.js` | 应用 Codex 遥测数据（token、上下文窗口） |
| `assistant-message-mode.js` | 规范化完成消息UI 模式 |
| `completion-error.js` | 启发式判断完成是否为错误 |
| `static-delivery.js` | ETag、Cache-Control、brotli/gzip 预压缩缓存 |

---

## 关键设计决策

### 1. 子进程必须比父进程活得久

Agent CLI 以 `detached: true` + `proc.unref()` 方式启动，stdin/stdout/stderr 通过 `sessions/{id}-run/` 目录下的文件代理（而非管道）。

PID 持久化到磁盘，`recoverProcesses()` 在 Node 重启后通过 `FileTailer` 重新连接。

systemd 单元使用 `KillMode=process` 确保子进程不被父进程杀死。

### 2. 默认绑定 127.0.0.1:8083

`lib/server-config.js` 从 `CC_WEB_HOST` / `CC_WEB_PORT` 解析绑定地址。

公网暴露通过 frp/ngrok 隧道实现，**不要**修改默认绑定地址。

### 3. Agent 调度走 agent-runtime.js

`createAgentRuntime(deps)` 返回 spawn spec、事件解析器、转录写入器和工具调用塑形器。

添加新 Agent 或修改消息形状在这里处理，不在 `server.js` 的每个调用点分支。

### 4. 会话沙箱隔离

Codex 会话使用 `config/codex-session-home/<id>/` 作为独立 `CODEX_HOME`，防止自定义 API 模板和 rollout 跨会话污染。

### 5. 所有磁盘路径可通过环境变量覆盖

| 环境变量 | 用途 |
|----------|------|
| `CC_WEB_CONFIG_DIR` | 配置目录 |
| `CC_WEB_SESSIONS_DIR` | 会话目录 |
| `CC_WEB_LOGS_DIR` | 日志目录 |
| `CC_WEB_PUBLIC_DIR` | 静态文件目录 |

回归测试通过这些变量将状态隔离到 `os.tmpdir()`。

---

## 数据流

### 消息发送

```
Browser  ──► WebSocket ──► server.js ──► stdin 文件 ──► Agent CLI
                                    │
                                    ├── 写入 sessions/{id}-run/stdin
                                    └── 更新会话状态
```

### 响应接收

```
Agent CLI ──► stdout 文件 ──► FileTailer ──► server.js ──► WebSocket ──► Browser
                                                      │
                                                      ├── 解析事件流
                                                      ├── 更新转录
                                                      └── 发送增量消息
```

### 进程恢复

```
Node 重启
    │
    ├── 扫描 sessions/ 目录
    ├── 读取持久化 PID
    ├── 检查进程存活（ps -p）
    ├── 存活 → 创建 FileTailer 继续监听
    └── 死亡 → 标记会话为完成
```

---

## 进程日志

`logs/process.log` 是 JSONL 格式，2 MB 轮转（`process.log` → `process.old.log`）。

`plog(level, event, data)` 是唯一的写入器（定义在 `server.js` 顶部）。

重要事件：

| 事件 | 含义 |
|------|------|
| `process_spawn` | 子进程启动 |
| `process_complete` | 子进程完成 |
| `ws_resume_attach` | WebSocket 重新连接到运行中进程 |
| `recovery_alive` | 恢复检测：进程存活 |
| `recovery_dead` | 恢复检测：进程已死 |
| `heartbeat` | 心跳（60 秒） |
