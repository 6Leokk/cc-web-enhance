# WebSocket 消息协议

本文档描述浏览器与 server.js 之间的 WebSocket 消息协议。

---

## 连接

```javascript
const ws = new WebSocket('ws://127.0.0.1:8083');
```

所有消息为 JSON 格式，统一结构：

```json
{
  "type": "<message_type>",
  "...": "..."
}
```

---

## 会话消息

### 发送消息

```json
{
  "type": "message",
  "sessionId": "<id>",
  "content": "Hello, agent!"
}
```

### 中断

```json
{
  "type": "abort",
  "sessionId": "<id>"
}
```

---

## 会话管理

### 新建会话

```json
{ "type": "new_session" }
```

### 加载会话

```json
{
  "type": "load_session",
  "sessionId": "<id>"
}
```

响应：

```json
{
  "type": "session_loaded",
  "sessionId": "<id>",
  "info": { "...": "..." },
  "history": [ "... messages ..." ]
}
```

### 加载会话历史（分块）

```json
{
  "type": "load_session_history_chunk",
  "sessionId": "<id>",
  "offset": 0,
  "limit": 50
}
```

### 删除会话

```json
{
  "type": "delete_session",
  "sessionId": "<id>"
}
```

### 重命名会话

```json
{
  "type": "rename_session",
  "sessionId": "<id>",
  "name": "new name"
}
```

### 列出会话

```json
{ "type": "list_sessions" }
```

### 设置模式（agent 类型）

```json
{
  "type": "set_mode",
  "mode": "claude"
}
```
可选值：`claude`, `codex`

### 分离视图

```json
{ "type": "detach_view" }
```

---

## 配置消息

配置使用统一的 `get_*_config` / `save_*_config` 命名空间：

| 类型 | 说明 |
|------|------|
| `get_notify_config` / `save_notify_config` | 通知设置 |
| `get_ui_config` / `save_ui_config` | UI 设置 |
| `get_model_config` / `save_model_config` | 模型设置 |
| `get_codex_config` / `save_codex_config` | Codex 设置 |
| `get_dev_config` / `save_dev_config` | 开发设置 |
| `get_access_config` / `save_access_config` | 访问模式设置 |

示例 - 获取配置：

```json
{ "type": "get_notify_config" }
```

示例 - 保存配置：

```json
{
  "type": "save_notify_config",
  "config": { "...": "..." }
}
```

---

## 流式响应事件

服务器推送的消息类型（由 `lib/agent-runtime.js` 生成）：

| 类型 | 说明 |
|------|------|
| `text_delta` | 增量文本内容 |
| `assistant_segment_start` | 助手段落开始 |
| `tool_use` | Agent 调用工具 |
| `tool_result` | 工具执行结果 |
| `tool_start` | 工具调用开始 |
| `error` | 错误信息 |

---

## 注意事项

1. `dispatch` 表在 `server.js` 的 `wss.on('connection', ...)` 中定义
2. 新增消息类型应添加 `case` 分支
3. 消息没有抽象层或路由层
4. 配置消息使用 `get_*_config` / `save_*_config` 命名空间
