# 用量统计与测试说明

本文档说明 `cc-web-enhance` 如何验证 Claude / Codex 的 token、上下文窗口和用量显示。目标读者是维护者和后续修改用量逻辑的开发者。

## 设计原则

用量统计不能靠前端估算。后端应优先使用 CLI 已经产出的结构化遥测，再把累计用量和当前上下文快照分开传给前端。

参考模型：

- Claude Code statusLine 会把 `context_window.current_usage`、`context_window.total_input_tokens`、`context_window.total_output_tokens`、`context_window.context_window_size`、`context_window.used_percentage` 和 `cost.total_cost_usd` 等字段交给状态行脚本。
- `ccstatusline` 的做法是优先读取 `context_window.current_usage`，缺失时再用 `used_percentage * context_window_size` 或 input/output 总量兜底。
- 本项目没有直接嵌入 Claude statusLine hook，但应保持同样边界：当前上下文使用量来自最近一次上下文快照，累计用量来自累计 token 遥测。

## 数据来源

### Claude

Claude 用量来自本地 transcript 中 assistant message 的 `usage` 字段。

解析文件：

- `lib/claude-transcript.js`

关键规则：

- `totalUsage.inputTokens` 累加 `usage.input_tokens`
- `totalUsage.cachedInputTokens` 累加 `cache_creation_input_tokens + cache_read_input_tokens`
- `totalUsage.outputTokens` 累加 `usage.output_tokens`
- `lastUsage` 只取最新的非 sidechain、非 API error assistant usage
- `lastUsage.inputTokens` 包含缓存 token，用于当前上下文窗口显示

### Codex

Codex 用量来自 rollout JSONL 的 `event_msg` / `token_count`。

解析文件：

- `lib/codex-rollouts.js`
- `lib/codex-telemetry.js`
- `lib/agent-runtime.js`

关键规则：

- `total_token_usage` 是累计用量
- `last_token_usage` 是当前上下文快照
- `model_context_window` 是上下文窗口大小
- `contextTokens` 使用 `last_token_usage.input_tokens`，用于当前上下文窗口占比
- `total_tokens` 和 `reasoning_output_tokens` 必须保留，不能只保留 input/output/cache 三个字段
- `cached_input_tokens` 是 input 的子集，显示累计总量时不能再次加到 input 上

## 前端显示

前端状态栏有两类 token 信息：

- `ctx ...`：当前上下文窗口使用量，来自 `lastUsage`
- 累计总量：来自 `totalUsage`

实现文件：

- `public/app.js`
- `public/styles/40-input-overlays.css`

`ctx` 段优先使用 `lastUsage.contextTokens`。如果没有 `contextTokens`，再退回 `lastUsage.inputTokens`。这里不能使用 `lastUsage.totalTokens` 作为上下文窗口分子，因为它会包含输出 token；Claude statusLine 和 `ccstatusline` 的上下文长度口径都是输入侧 token。

累计总量段优先使用 `totalUsage.totalTokens`。旧数据没有 `totalTokens` 时，Claude 兜底为 `inputTokens + cachedInputTokens + outputTokens`，Codex 兜底为 `inputTokens + outputTokens`，避免把 Codex 的 `cachedInputTokens` 子集重复加进去。

## 必跑测试

修改用量逻辑后至少运行：

```bash
npm run regression:context-telemetry
npm run regression:ui
```

完整复核运行：

```bash
npm run regression
```

## 测试覆盖点

### `scripts/context-telemetry-regression.js`

覆盖后端用量解析和持久化：

- Codex rollout `token_count` 读取 `total_token_usage`
- Codex rollout `token_count` 读取 `last_token_usage`
- Codex `model_context_window` 持久化到 session
- Codex `contextTokens` 使用 `last_token_usage.input_tokens`，和 `total_tokens` 分开
- Codex `total_tokens` 和 `reasoning_output_tokens` 不丢失
- Codex 历史 rollout 解析和实时 token_count 流使用同一套口径
- 重复 token_count 不重复保存和推送
- `turn.completed` 只作为累计遥测，不伪造当前上下文快照
- stale rollout 不覆盖更新的 live telemetry
- Claude transcript 汇总总 token
- Claude transcript 只从有效 assistant usage 恢复当前上下文快照
- Claude 当前 `contextTokens` 使用 `input_tokens + cache_creation_input_tokens + cache_read_input_tokens`，不包含输出 token

### `scripts/ui-regression.js`

覆盖前端显示合同：

- session payload 携带 `totalUsage`、`lastUsage` 和 `contextWindowTokens`
- runtime usage update 同时传递累计用量和当前上下文快照
- composer statusline 渲染 `is-context` 段
- `formatCurrentContextUsageText()` 优先使用 `lastUsage.contextTokens`
- 累计 total 优先使用显式 `totalTokens`；旧 Claude 数据兜底时才加入 `cachedInputTokens`
- Codex `turn.completed` 不设置 `lastUsage`

## 手工视觉复核

用量相关 UI 改动后，需要启动本地服务并截图确认：

```bash
npm start
```

检查点：

- 登录后输入框下方状态栏可见
- 状态栏包含模型、cwd、`ctx ...`、累计 token、git 状态
- `ctx` 文本不会挤压输入框或和按钮重叠
- 移动端宽度下状态栏能截断长路径，不撑破布局

建议截图路径：

```text
artifacts/usage-statusline-desktop.png
artifacts/usage-statusline-mobile.png
```

## 常见错误

- 把 cumulative total 当作当前上下文用量显示
- 用 `totalTokens` 计算 `ctx` 百分比，导致输出 token 被算入上下文窗口分子
- 把 `cachedInputTokens` 再加到 Codex `inputTokens` 上，造成双计
- 用 Codex `turn.completed` 伪造 `lastUsage`
- stale rollout 覆盖 live session 的新 telemetry
- 只测试 Claude，不测试 Codex rollout 中的 `total_tokens` 和 `reasoning_output_tokens`
