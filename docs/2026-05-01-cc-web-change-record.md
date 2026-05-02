# 2026-05-01 CC-Web 本地修改记录

本文档记录 2026-05-01 至 2026-05-02 在本地 `cc-web` 项目中的主要修改，供后续查证、回归测试和继续优化使用。

不包含任何真实密码、Bark device key、API key、token 或其它敏感值。敏感配置只记录变量名、配置文件位置和行为。

## 范围

本次记录覆盖以下方向：

- 局域网访问与 systemd 运行方式
- Bark/通知配置
- 移动端侧栏手势设置
- 主题与黑白暗夜模式
- Assistant 消息显示模式和 Codex 流式分段
- 工具调用展示与折叠
- Codex 任务完成错误判定
- 2026-05-02 移动端滚动、会话切换竞态与运行中气泡隔离修复
- 2026-05-02 多浏览器进入页面后的后台完成同步修复
- 2026-05-02 顶部会话状态位与路径展示调整
- 2026-05-02 输入框与上传按钮垂直对齐修复
- 2026-05-02 输入框下方状态栏
- 2026-05-02 局域网刷新性能优化
- 2026-05-02 Codex 思考强度结构化显示
- 2026-05-02 前台恢复滚动意图收紧
- 2026-05-02 服务重启后的分段与刷新端到端复核
- 回归脚本与验证命令

不覆盖：

- 真实 `.env` 内容
- `config/` 下的本地私密配置内容
- 具体账号、token、Bark key、登录密码

## 局域网访问与 systemd

新增或调整点：

- `HOST` 环境变量支持。
- 默认仍保持 `127.0.0.1`。
- 本地 `.env` 可设置 `HOST=0.0.0.0` 以允许局域网访问。
- 服务由系统级 `cc-web.service` 管理。

相关文件：

- `.env.example`
- `README.md`
- `README.en.md`
- `server.js`

注意事项：

- 局域网 IP 不应写死到配置或代码里。
- `config/` 和 `.env` 已在 `.gitignore` 中，避免上传本地敏感配置。
- systemd 环境下 CLI 路径需要能被服务进程找到；此前曾遇到 `spawn codex ENOENT`。

## Bark 与通知配置

新增或调整点：

- Bark 通知支持。
- Bark 可从 `.env` 首次迁移到 `config/notify.json`。
- 支持的 Bark 环境变量包括：
  - `BARK_DEVICE_KEY`
  - `BARK_SERVER_URL`
  - `BARK_GROUP`
  - `BARK_LEVEL`
  - `BARK_SOUND`
  - `BARK_ICON`
  - `BARK_URL`
- 通知设置页新增“任务完成通知”选项：
  - `仅后台任务通知`
  - `网页前台也通知`
- 通知摘要设置仍属于通知配置的一部分。

相关文件：

- `.env.example`
- `README.md`
- `README.en.md`
- `server.js`
- `public/app.js`
- `scripts/notify-regression.js`
- `scripts/notify-foreground-regression.js`

本地使用说明：

- 真实 Bark key 应放在 `.env` 或 UI 保存后的 `config/notify.json`。
- 不要把真实 key 写进 README、脚本或源码。

## 移动端侧栏手势

新增或调整点：

- 设置页新增“侧栏滑动手势”开关。
- 开启后：移动端可右滑打开、左滑关闭会话栏。
- 关闭后：只能通过左上角按钮打开，通过遮罩关闭；右滑/左滑都不触发侧栏。
- 设置保存在浏览器 localStorage：`cc-web-sidebar-swipe-enabled`。

相关文件：

- `public/app.js`
- `scripts/sidebar-swipe-regression.js`

## 主题与黑白暗夜模式

新增或调整点：

- 新增 `黑白暗夜` 主题。
- 新增 `跟随系统` 主题选项。
- `跟随系统` 在系统深色模式下解析为 `mono-night`，浅色模式下解析为 `washi`。
- 初始 HTML 也会在 CSS 加载前解析系统主题，减少闪烁。
- 修复黑白暗夜下 command/file-change 工具展开内容仍使用浅色背景的问题。

相关文件：

- `public/app.js`
- `public/index.html`
- `public/style.css`
- `scripts/theme-regression.js`
- `scripts/ui-regression.js`

## Assistant 消息显示模式

新增或调整点：

- 设置页新增 “Assistant 消息显示”。
- 支持两种模式：
  - `分段显示（默认）`
  - `合并为一条`
- 默认值是 `segmented`。
- 配置保存在 `config/ui.json`。
- 该设置只影响之后新生成的 assistant 回复，不重排、不迁移、不改写旧历史。
- 历史消息保持保存时的结构。

相关文件：

- `lib/assistant-message-mode.js`
- `server.js`
- `public/app.js`
- `public/style.css`
- `scripts/assistant-message-mode-regression.js`

行为说明：

- `分段显示（默认）`：每段 assistant 回复单独成条，工具调用跟在对应段落下面。
- `合并为一条`：每轮 assistant 回复只保存和展示一条，工具调用集中挂在该条下面。

## Codex 流式分段

问题背景：

- 之前运行中只有一个 `#streaming-msg` 气泡。
- Codex 完成后，服务端发送 `assistant_messages_final`，前端再把单条流式气泡替换成分段消息。
- 结果是：运行中看起来是一整段，结束后才变成分段。

新增或调整点：

- Codex runtime 在新的 `agent_message` 段开始时发送 `assistant_segment_start`。
- 前端在 `分段显示` 模式下收到该事件后，会立即收尾当前流式气泡并开启下一条 assistant 气泡。
- 在 `合并为一条` 模式下，前端继续保持单条流式气泡，并把段落分隔符拼回文本。
- 2026-05-02 16:50 继续修复：取消“单个 Codex `agent_message` 内按 Markdown 空行拆气泡”的规则。
- 新规则：同一条 `agent_message` 内的自然段、列表、代码块和总结说明保留在同一个 assistant 气泡；只有 Codex 明确发出下一条 `agent_message` 时才新开气泡。
- 恢复生成时，`resume_generating` 会携带当前 `assistantSegments`，前端按这些分段重建多个运行中气泡，而不是只用 `fullText` 重画成一个大气泡。
- 恢复生成会尊重 “合并为一条” 模式；该模式下仍按单气泡展示。
- 2026-05-02 复核发现：前端 `/app.js` 已能取到新逻辑，但 systemd 主 Node 进程仍是 05:13 启动，早于 `lib/agent-runtime.js` 和 `server.js` 修改时间，因此后端内存里仍是旧 runtime。
- 已执行 `sudo -n systemctl restart cc-web.service`，重启后 `cc-web.service` active since 2026-05-02 16:10:34 CST，主进程 PID 为 `3355929`。
- 已在隔离临时服务中通过端到端回归：单条 Markdown `agent_message` 完成时保存为 1 条 assistant 消息，另一个连接重新 `load_session` 能读到最后一段。
- `scripts/codex-message-format-regression.js` 覆盖两条相反规则：不同 `agent_message` 之间仍分气泡；同一 `agent_message` 内的空行不再分气泡。
- 已经在浏览器里渲染成单个大气泡的旧内容不会被 retroactive 重切；重启后新事件和新回复才走新的分段处理。

相关文件：

- `lib/agent-runtime.js`
- `public/app.js`
- `scripts/assistant-message-mode-regression.js`
- `scripts/codex-message-format-regression.js`
- `scripts/codex-stream-refresh-regression.js`

## 2026-05-02 移动端滚动与会话切换修复

问题背景：

- 移动设备从其他应用切回浏览器，或键盘弹出后，聊天页面可能自动跳到历史消息中间。
- 左侧快速切换不同会话时，也可能突然跳到中间或显示旧会话返回的数据。

新增或调整点：

- 空闲前台恢复时不再强制重新加载当前完整会话，只刷新轻量会话列表。
- 仅当当前会话仍在运行或流式生成中，前台恢复才重新 `load_session`。
- 页面隐藏、`pagehide`、`pageshow`、`visibilitychange`、`visualViewport.resize/scroll` 会协同记录“隐藏前是否在底部”。
- 如果隐藏前用户在底部，恢复后使用短时重复底部锚定，覆盖 iOS Safari 地址栏、键盘和视口恢复期间的迟到布局变化。
- `.messages` 禁用浏览器 scroll anchoring，避免历史块 prepend 后浏览器自行选择旧消息作为锚点。
- 左侧会话切换的 `load_session` 新增 `requestId`，服务端在 `session_info` 与 `session_history_chunk` 中原样回传。
- 前端只接受当前活动 `requestId` 对应的 `session_info` 和历史分块，丢弃快速切换时晚到的旧响应。
- 阻塞式会话切换完成后使用同一套短时底部锚定，避免历史分块、侧栏关闭或布局稳定后把视图顶到中间。

相关文件：

- `public/app.js`
- `public/style.css`
- `server.js`
- `scripts/mobile-scroll-regression.js`

## 2026-05-02 多浏览器后台完成同步修复

问题背景：

- 从另一个浏览器或新页面进入 CC-Web 时，左侧/顶部状态可能已经显示任务完成，但当前消息列表缺少最后的 assistant 回复。
- 手动刷新页面或切换会话后才能看到完整消息。

根因：

- 任务完成后，如果仍有一个 WebSocket 作为该任务的流式接收者，服务端只给该 WebSocket 发送 `assistant_messages_final` / `done` / `session_list`。
- 其他已连接页面只可能看到会话列表状态变化，当前消息快照不会自动重拉。
- 前端处理 `session_list` 时只更新会话元信息和运行状态，没有在当前会话从 `isRunning=true` 变为 `false`、出现 `hasUnread`、或缓存版本落后时强制重新加载当前会话消息。

新增或调整点：

- 服务端新增 `broadcastBackgroundDone(sessionId, entry, excludeWs)`。
- 当任务完成且存在流式接收 WebSocket 时，除了给该接收者发送最终流式结果，也会向其他已连接客户端广播 `background_done`。
- 前端新增 `refreshCurrentSessionAfterMetadataChange(previousMeta, nextMeta)`。
- `session_list` 会在更新前保存当前会话旧 meta，更新后对比新 meta。
- 当前会话从运行中变为已完成、变为未读、或本地缓存版本落后于最新 `updated` 时，前端会以 `forceSync + blocking:false` 静默重拉当前会话。
- 该逻辑复用已有 `requestId` 防旧响应机制，避免和左侧快速切换会话互相污染。
- 2026-05-02 端到端复核已覆盖：第二个 WebSocket 连接收到 `background_done` 后，重新 `load_session` 可以拿到已经保存的最后 assistant 消息；单条 Markdown 回复不会因空行被保存成多条消息。

相关文件：

- `server.js`
- `public/app.js`
- `scripts/ui-regression.js`
- `scripts/codex-stream-refresh-regression.js`

## 2026-05-02 顶部会话状态位与路径展示调整

新增或调整点：

- 聊天页右上角中间状态位不再显示路径。
- 当前有会话时，该状态位固定显示会话状态：
  - `运行中`：闪动圆点
  - `已完成`：静态圆点
- 原本展示在该位置的路径暂时保留为会话标题的 tooltip，不再占用顶部状态槽位。
- 状态位会跟随当前会话切换、运行结束、前台恢复与静默刷新同步更新。

相关文件：

- `public/app.js`
- `public/styles/20-base-layout.css`
- `scripts/ui-regression.js`

## 2026-05-02 输入框与上传按钮垂直对齐修复

新增或调整点：

- 底部输入区保持上传按钮原位置不动。
- 文本输入区域改为在输入容器内部垂直居中，和左侧上传按钮保持平行。
- 新增回归约束，明确“上传按钮尺寸与外层对齐规则保持不变，变化只能落在输入框自身”。

相关文件：

- `public/styles/40-input-overlays.css`
- `scripts/ui-regression.js`

## 2026-05-02 输入框下方状态栏

新增或调整点：

- 在输入框下方新增一行纯文字状态栏，当前格式为：
  - `完整模型字符串 | 当前目录 | 当前上下文占用 / 总上下文 | 累计总用量 | Git 分支 (+新增 -删除)`
- 最左侧显示当前模型的完整字符串，例如 `gpt-5.4(xhigh)`、`gpt-5.5`、`opus`、`sonnet`。
- 当前目录优先显示服务端生成的 `cwdDisplay`，本地 HOME 目录下路径明确保留 `~` 前缀；远程任务优先显示远端工作目录。
- Git 状态使用当前本地 `cwd` 实时执行 `git` 命令获取：
  - 分支名
  - 相对 `HEAD` 的新增/删除行数
- 会话加载时，`session_info` 里新增 `workspaceStatus`。
- 任务完成时，服务端会额外推送 `workspace_status`，让状态栏更新最新 Git 变更。

上下文与用量显示规则：

- 不使用前端估算器，不用消息文本长度伪造上下文占用。
- `当前上下文占用 / 总上下文` 只使用运行时真实 `lastUsage` 数据，不再把会话累计 token 混进去。
- `累计总用量` 单独显示，来自会话累计 `totalUsage` 汇总。
- 当前版本中：
  - Codex 会话可显示 runtime `lastUsage` 对应的当前上下文占用，并持久化到会话文件。
  - Claude 会话当前没有 runtime token 使用事件时，当前上下文占用显示为未知。
- “总上下文”只在有明确真值时显示：
  - Claude `opus` / `sonnet`（项目内启用 `[1m]` 模式）显示 `1M`
  - 已显式映射的模型（例如 `gpt-5.4`、`gpt-5.5`）显示对应上限
  - 其他模型暂时显示未知 `?`

相关文件：

- `public/index.html`
- `public/app.js`
- `public/styles/40-input-overlays.css`
- `server.js`
- `scripts/ui-regression.js`

## 2026-05-02 局域网刷新性能优化

新增或调整点：

- 浏览器关键启动依赖不再从公共 CDN 拉取。
- 新增本地 vendor 资源：
  - `marked`
  - `highlight.js`
  - `atom-one-dark` 样式
  - `DOMPurify`
- `index.html` 继续使用 `no-cache`，确保部署变更能被立即发现。
- 非 shell 静态资源改为验证型缓存：
  - 返回 `ETag`
  - 返回 `Last-Modified`
  - 使用 `public, max-age=0, must-revalidate`
- 局域网内重复刷新时，浏览器可通过条件请求避免不必要的完整资源传输。

相关文件：

- `public/index.html`
- `public/vendor/*`
- `server.js`
- `scripts/ui-regression.js`

## 2026-05-02 Codex 思考强度结构化显示

新增或调整点：

- `reasoningEffort` 从“拼在 model 字符串里”改为独立结构化字段。
- `session_info` 与 `model_changed` 会向前端单独传递：
  - `model`
  - `reasoningEffort`
- 前端统一通过格式化函数在展示层组合成：
  - `gpt-5.4(xhigh)`
- 旧会话兼容处理：
  - 如果旧会话里仍保存成 `gpt-5.4(xhigh)`，会在服务端自动拆分
  - 如果会话文件缺少 `reasoningEffort`，但 `codexHomeDir/config.toml` 中存在 `model_reasoning_effort`，也会在加载时补出该字段
- Codex rollout 导入新增 `turn_context` 解析，可从历史中恢复 `model` 与 `reasoningEffort`
- Codex CLI 启动改为：
  - `--model <base model>`
  - 独立 `model_reasoning_effort="<level>"`

相关文件：

- `server.js`
- `lib/agent-runtime.js`
- `lib/codex-rollouts.js`
- `public/app.js`
- `scripts/ui-regression.js`

## 2026-05-02 前台恢复滚动意图收紧

新增或调整点：

- 前台恢复新增独立意图标记：`shouldAnchorBottomOnForegroundReturn`
- 页面进入后台时，是否应在回前台后强制回到底部，只由“隐藏前是否在底部”决定
- 不再把 `msgInput` 焦点当成前台恢复时必须回到底部的强信号
- `pageshow` 和 `visibilitychange` 在恢复时都使用这条独立意图，而不是继续混用宽泛的焦点/视口判断
- 保留原有移动端底部锚定能力，但减少“从其他 App 切回浏览器时误跳历史/误吸到底部”的概率

相关文件：

- `public/app.js`
- `scripts/foreground-restore-regression.js`
- `scripts/mobile-scroll-regression.js`

## 工具调用展示与折叠

新增或调整点：

- 工具调用达到第 3 个时立即折叠。
- 之前是第 4 个才折叠，原因是判断发生在新工具插入之前。
- 折叠组存在后，后续工具继续进入折叠组。
- 分段流式气泡中，工具调用跟随当前段落。

相关文件：

- `public/app.js`
- `public/style.css`
- `scripts/assistant-message-mode-regression.js`

## Codex 任务完成错误判定

问题背景：

- 曾出现 `apply_patch verification failed` 被 Web 页面显示为 `Codex 任务失败`。
- 根因是 PID 监控路径不知道真实 exit code 时，把 stderr 中的工具级错误当成整轮任务失败。

新增或调整点：

- 新增 `lib/completion-error.js`。
- 如果 PID 监控检测到进程退出，但已经有正常回复文本，则不会把工具级 stderr 直接判定为整轮任务失败。
- 如果真实非零退出，或没有回复文本但 stderr 有内容，仍会作为失败展示。

相关文件：

- `lib/completion-error.js`
- `server.js`
- `scripts/ui-regression.js`

## 回归脚本

新增或整理的 npm script：

- `npm run regression`
- `npm run regression:assistant-mode`
- `npm run regression:codex-format`
- `npm run regression:codex-stream-refresh`
- `npm run regression:notify`
- `npm run regression:notify-foreground`
- `npm run regression:sidebar-swipe`
- `npm run regression:theme`
- `npm run regression:mobile-scroll`
- `npm run regression:ui`

相关文件：

- `package.json`
- `scripts/assistant-message-mode-regression.js`
- `scripts/codex-message-format-regression.js`
- `scripts/codex-stream-refresh-regression.js`
- `scripts/notify-regression.js`
- `scripts/notify-foreground-regression.js`
- `scripts/sidebar-swipe-regression.js`
- `scripts/theme-regression.js`
- `scripts/mobile-scroll-regression.js`
- `scripts/ui-regression.js`

## 常用验证命令

```bash
npm run regression:assistant-mode
npm run regression:codex-format
npm run regression:codex-stream-refresh
npm run regression:ui
npm run regression:theme
npm run regression:sidebar-swipe
npm run regression:notify
npm run regression:notify-foreground
node --check server.js
node --check public/app.js
node --check lib/agent-runtime.js
node --check lib/assistant-message-mode.js
node --check lib/completion-error.js
```

systemd 状态检查：

```bash
systemctl status cc-web.service --no-pager -l
```

服务重启：

```bash
sudo systemctl restart cc-web.service
```

## 后续待查问题

2026-05-02 已处理的问题：

- 移动端从其它应用切回浏览器、或键盘弹出时，聊天视图跳到历史消息位置。
- 左侧快速切换会话时，晚到的旧 `session_info` / `session_history_chunk` 影响当前视图。
- Codex 不同 `agent_message` 之间的运行中气泡隔离。
- Codex 单个 Markdown `agent_message` 因空行被过度拆成多个小气泡。
- 另一个浏览器或新页面显示任务已完成，但当前消息列表缺少最后 assistant 回复。
- 2026-05-02 16:10 已重启 `cc-web.service`，使后端加载分段与刷新修复。

已有相关脚本：

- `scripts/mobile-scroll-regression.js`
- `scripts/codex-message-format-regression.js`
- `scripts/codex-stream-refresh-regression.js`
