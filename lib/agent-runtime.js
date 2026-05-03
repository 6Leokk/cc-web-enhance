function createAgentRuntime(deps) {
  const {
    processEnv,
    CLAUDE_PATH,
    CODEX_PATH,
    MODEL_MAP,
    loadModelConfig,
    applyCustomTemplateToSettings,
    loadCodexConfig,
    prepareCodexCustomRuntime,
    wsSend,
    truncateObj,
    sanitizeToolInput,
    loadSession,
    saveSession,
    setRuntimeSessionId,
    getRuntimeSessionId,
  } = deps;

  const MAX_FULL_TEXT_CHARS = 2 * 1024 * 1024; // 2M UTF-16 code units
  const MAX_TOOL_CALLS = 200;

  function appendFullText(entry, text) {
    if (!text) return;
    const remaining = MAX_FULL_TEXT_CHARS - entry.fullText.length;
    if (remaining <= 0) {
      entry.fullTextTruncated = true;
      return;
    }
    if (text.length <= remaining) {
      entry.fullText += text;
    } else {
      // Avoid splitting a surrogate pair at the boundary
      let end = remaining;
      if (text.charCodeAt(end - 1) >= 0xd800 && text.charCodeAt(end - 1) <= 0xdbff) {
        end -= 1;
      }
      entry.fullText += text.slice(0, end);
      entry.fullTextTruncated = true;
    }
  }

  function cloneToolCall(tool) {
    if (!tool || typeof tool !== 'object') return tool;
    return { ...tool };
  }

  function getCurrentAssistantSegment(entry, options = {}) {
    const { forTool = false } = options;
    if (!Array.isArray(entry.assistantSegments)) entry.assistantSegments = [];
    let segment = entry.assistantSegments[entry.assistantSegments.length - 1];
    if (!segment) {
      segment = { content: '', toolCalls: [] };
      entry.assistantSegments.push(segment);
    }
    if (forTool && String(segment.content || '').trim() === '' && (segment.toolCalls || []).length === 0) {
      const previousTextSegment = entry.assistantSegments
        .slice(0, -1)
        .reverse()
        .find((item) => item && String(item.content || '').trim());
      if (previousTextSegment) {
        entry.assistantSegments.pop();
        segment = previousTextSegment;
      }
    }
    return segment;
  }

  function startAssistantSegment(entry) {
    if (!Array.isArray(entry.assistantSegments)) entry.assistantSegments = [];
    const last = entry.assistantSegments[entry.assistantSegments.length - 1];
    if (last && !(String(last.content || '').trim() || (last.toolCalls || []).length > 0)) {
      return { segment: last, startedNew: false, segmentIndex: entry.assistantSegments.length - 1 };
    }
    const segment = { content: '', toolCalls: [] };
    entry.assistantSegments.push(segment);
    return {
      segment,
      startedNew: entry.assistantSegments.length > 1,
      segmentIndex: entry.assistantSegments.length - 1,
    };
  }

  function appendCurrentSegmentText(entry, text) {
    if (!text) return;
    const segment = getCurrentAssistantSegment(entry);
    segment.content += text;
  }

  function attachToolToCurrentSegment(entry, tool) {
    const segment = getCurrentAssistantSegment(entry, { forTool: true });
    if (!Array.isArray(segment.toolCalls)) segment.toolCalls = [];
    if (!segment.toolCalls.some((item) => item && item.id === tool.id)) {
      segment.toolCalls.push(tool);
    }
  }

  function appendCodexAgentMessage(entry, text) {
    if (!text) return null;
    let prefix = '';
    if (entry.fullText) {
      if (/\n\s*\n$/.test(entry.fullText) || /^\s*\n/.test(text)) {
        prefix = '';
      } else if (/\n\s*$/.test(entry.fullText)) {
        prefix = '\n';
      } else {
        prefix = '\n\n';
      }
    }
    const delta = prefix + text;
    appendFullText(entry, delta);
    const events = [];
    const segmentState = startAssistantSegment(entry);
    const segment = segmentState.segment;
    if (segmentState.startedNew) {
      events.push({ type: 'assistant_segment_start', prefix: prefix || '' });
    }
    segment.content += text;
    events.push({ type: 'text_delta', text });

    return {
      text,
      delta,
      prefix,
      startedNew: events.some((event) => event.type === 'assistant_segment_start'),
      events,
    };
  }

  function buildClaudeSpawnSpec(session, options = {}) {
    const hasAttachments = Array.isArray(options.attachments) && options.attachments.length > 0;
    const args = ['-p', '--output-format', 'stream-json', '--verbose'];
    if (hasAttachments) args.push('--input-format', 'stream-json');
    const permMode = session.permissionMode || 'yolo';
    switch (permMode) {
      case 'yolo':
        args.push('--dangerously-skip-permissions');
        break;
      case 'plan':
        args.push('--permission-mode', 'plan');
        break;
      case 'default':
        args.push('--permission-mode', 'default');
        break;
    }
    if (session.claudeSessionId) {
      args.push('--resume', session.claudeSessionId);
    }
    if (session.model) {
      args.push('--model', session.model);
    }

    const env = { ...processEnv };
    delete env.CLAUDECODE;
    delete env.CLAUDE_CODE;
    delete env.CC_WEB_PASSWORD;
    for (const k of Object.keys(env)) {
      if (k.startsWith('ANTHROPIC_')) delete env[k];
    }

    const modelCfg = loadModelConfig();
    if (modelCfg.mode === 'custom' && modelCfg.activeTemplate) {
      const tpl = (modelCfg.templates || []).find((t) => t.name === modelCfg.activeTemplate);
      if (tpl) applyCustomTemplateToSettings(tpl);
    }

    return {
      command: CLAUDE_PATH,
      args,
      env,
      cwd: session.cwd || processEnv.HOME || processEnv.USERPROFILE || process.cwd(),
      parser: 'claude',
      mode: permMode,
      resume: !!session.claudeSessionId,
    };
  }

  function buildCodexSpawnSpec(session, options = {}) {
    const codexConfig = loadCodexConfig();
    const runtimeConfig = prepareCodexCustomRuntime(codexConfig, session);
    if (runtimeConfig?.error) {
      return { error: runtimeConfig.error };
	    }
	    const runtimeId = getRuntimeSessionId(session);
	    const args = ['exec'];
	    args.push('--json', '--skip-git-repo-check');

	    const permMode = session.permissionMode || 'yolo';
	    // `-s/--sandbox` is an option for `codex exec`, but not for `codex exec resume`.
	    // When resuming, it must appear before the `resume` subcommand, otherwise Codex CLI errors
	    // with: "unexpected argument '-s' found".
	    if (runtimeId && permMode === 'plan') {
	      args.push('-s', 'read-only');
	    }
	    if (runtimeId) args.push('resume');
	    switch (permMode) {
	      case 'yolo':
	        args.push('--dangerously-bypass-approvals-and-sandbox');
	        break;
	      case 'plan':
	        if (!runtimeId) args.push('-s', 'read-only');
	        break;
	      case 'default':
	      default:
	        args.push('--full-auto');
        break;
    }

    const effectiveModel = String(session.model || '').trim();
    const effectiveReasoning = String(session.reasoningEffort || '').trim().toLowerCase();
    if (effectiveModel) {
      args.push('--model', effectiveModel);
      if (['medium', 'high', 'xhigh'].includes(effectiveReasoning)) {
        args.push('-c', `model_reasoning_effort="${effectiveReasoning}"`);
      }
    }
    if (Array.isArray(options.attachments)) {
      for (const attachment of options.attachments) {
        if (attachment?.path) args.push('--image', attachment.path);
      }
    }
    if (runtimeId) {
      args.push(runtimeId, '-');
    } else {
      if (session.cwd) args.push('-C', session.cwd);
      args.push('-');
    }

    const env = { ...processEnv };
    delete env.CC_WEB_PASSWORD;
    delete env.CLAUDECODE;
    delete env.CLAUDE_CODE;
    if (runtimeConfig?.homeDir) {
      env.CODEX_HOME = runtimeConfig.homeDir;
    }
    if (runtimeConfig?.mode === 'custom') {
      env.OPENAI_API_KEY = runtimeConfig.apiKey;
      delete env.OPENAI_BASE_URL;
    }

    return {
      command: CODEX_PATH,
      args,
      env,
      cwd: session.cwd || processEnv.HOME || processEnv.USERPROFILE || process.cwd(),
      parser: 'codex',
      mode: permMode,
      resume: !!runtimeId,
      codexRuntimeKey: runtimeConfig?.runtimeKey || '',
      codexHomeDir: runtimeConfig?.homeDir || '',
    };
  }

  function codexToolName(item) {
    switch (item?.type) {
      case 'command_execution':
        return 'CommandExecution';
      case 'mcp_tool_call':
        return 'McpToolCall';
      case 'file_change':
        return 'FileChange';
      case 'reasoning':
        return 'Reasoning';
      default:
        return item?.type || 'CodexItem';
    }
  }

  function codexToolInput(item) {
    if (!item) return null;
    if (item.type === 'command_execution') return { command: item.command || '' };
    return truncateObj(item, 500);
  }

  function codexToolMeta(item) {
    if (!item) return null;
    switch (item.type) {
      case 'command_execution':
        return {
          kind: 'command_execution',
          title: 'Shell Command',
          subtitle: item.command || '',
          exitCode: typeof item.exit_code === 'number' ? item.exit_code : null,
          status: item.status || null,
        };
      case 'mcp_tool_call':
        return {
          kind: 'mcp_tool_call',
          title: 'MCP Tool',
          subtitle: item.tool_name || item.name || item.server_name || '',
          status: item.status || null,
        };
      case 'file_change':
        return {
          kind: 'file_change',
          title: 'File Change',
          subtitle: item.path || item.file_path || '',
          status: item.status || null,
        };
      case 'reasoning':
        return {
          kind: 'reasoning',
          title: 'Reasoning',
          subtitle: typeof item.text === 'string' ? item.text.slice(0, 120) : '',
          status: item.status || null,
        };
      default:
        return {
          kind: item.type || 'codex_item',
          title: codexToolName(item),
          subtitle: '',
          status: item.status || null,
        };
    }
  }

  function codexToolResult(item) {
    if (!item) return '';
    if (typeof item.aggregated_output === 'string' && item.aggregated_output) return item.aggregated_output;
    if (typeof item.text === 'string' && item.text) return item.text;
    return JSON.stringify(truncateObj(item, 1200));
  }

  function ensureCodexToolCall(entry, item, sessionId) {
    let tc = entry.toolCalls.find((t) => t.id === item.id);
    if (tc) {
      tc.name = codexToolName(item);
      tc.kind = item.type || tc.kind || null;
      tc.meta = codexToolMeta(item) || tc.meta || null;
      if (tc.input == null) tc.input = codexToolInput(item);
      return tc;
    }
    tc = {
      name: codexToolName(item),
      id: item.id,
      kind: item.type || null,
      meta: codexToolMeta(item),
      input: codexToolInput(item),
      done: false,
    };
    if (entry.toolCalls.length < MAX_TOOL_CALLS) entry.toolCalls.push(tc);
    else entry.toolCallsTruncated = true;
    attachToolToCurrentSegment(entry, tc);
    wsSend(entry.ws, {
      type: 'tool_start',
      sessionId,
      name: tc.name,
      toolUseId: item.id,
      input: tc.input,
      kind: tc.kind,
      meta: tc.meta,
    });
    return tc;
  }

  function normalizeUsageSnapshot(usage, source) {
    if (!usage || typeof usage !== 'object') return null;
    return {
      inputTokens: Number(usage.input_tokens || 0),
      cachedInputTokens: Number(usage.cached_input_tokens || 0),
      outputTokens: Number(usage.output_tokens || 0),
      source,
    };
  }

  function mergeUsageTotals(current, incoming) {
    if (!incoming) return current || { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 };
    return {
      inputTokens: Math.max(Number(current?.inputTokens || 0), Number(incoming.inputTokens || 0)),
      cachedInputTokens: Math.max(Number(current?.cachedInputTokens || 0), Number(incoming.cachedInputTokens || 0)),
      outputTokens: Math.max(Number(current?.outputTokens || 0), Number(incoming.outputTokens || 0)),
    };
  }

  function buildCodexContextUsageSnapshot(usage, contextWindowTokens) {
    const snapshot = normalizeUsageSnapshot(usage, 'context');
    if (!snapshot) return null;
    if (Number(contextWindowTokens || 0) > 0) snapshot.contextWindowTokens = Number(contextWindowTokens);
    else snapshot.contextWindowTokens = null;
    return snapshot;
  }

  function usageStateKey(totalUsage, lastUsage, contextWindowTokens) {
    return JSON.stringify({
      totalUsage: totalUsage || null,
      lastUsage: lastUsage || null,
      contextWindowTokens: Number(contextWindowTokens || 0) || null,
    });
  }

  function persistCodexContextTelemetry(entry, sessionId, options = {}) {
    const session = loadSession(sessionId);
    const contextWindowTokens = Number(options.contextWindowTokens || entry.lastUsage?.contextWindowTokens || session?.contextWindowTokens || 0) || null;
    const totalUsage = options.totalUsage || null;
    const lastUsage = options.lastUsage || null;
    if (lastUsage) entry.lastUsage = lastUsage;
    if (!session) {
      if (entry.ws && (totalUsage || lastUsage || contextWindowTokens)) {
        wsSend(entry.ws, {
          type: 'usage',
          sessionId,
          totalUsage: totalUsage || null,
          lastUsage: lastUsage || null,
          contextWindowTokens,
        }, true);
      }
      return;
    }

    const nextTotalUsage = totalUsage
      ? mergeUsageTotals(session.totalUsage, totalUsage)
      : (session.totalUsage || null);
    let nextLastUsage = lastUsage || session.lastUsage || null;
    const nextContextWindowTokens = contextWindowTokens || session.contextWindowTokens || null;
    if (nextContextWindowTokens && nextLastUsage && !Number(nextLastUsage.contextWindowTokens || 0)) {
      nextLastUsage = { ...nextLastUsage, contextWindowTokens: nextContextWindowTokens };
    }
    if (
      usageStateKey(session.totalUsage || null, session.lastUsage || null, session.contextWindowTokens || null)
      === usageStateKey(nextTotalUsage, nextLastUsage, nextContextWindowTokens)
    ) {
      return;
    }
    session.totalUsage = nextTotalUsage;
    session.lastUsage = nextLastUsage;
    session.contextWindowTokens = nextContextWindowTokens;
    saveSession(session);
    if (entry.ws && (session.totalUsage || session.lastUsage || session.contextWindowTokens)) {
      wsSend(entry.ws, {
        type: 'usage',
        sessionId,
        totalUsage: session.totalUsage || null,
        lastUsage: session.lastUsage || null,
        contextWindowTokens: session.contextWindowTokens || null,
      }, true);
    }
  }

  function processClaudeEvent(entry, event, sessionId) {
    if (!event || !event.type) return;

    switch (event.type) {
      case 'system':
        if (event.session_id) {
          const session = loadSession(sessionId);
          if (session) {
            session.claudeSessionId = event.session_id;
            saveSession(session);
          }
        }
        break;

      case 'assistant': {
        const content = event.message?.content;
        if (!Array.isArray(content)) break;

        for (const block of content) {
          if (block.type === 'text' && block.text) {
            appendFullText(entry, block.text);
            appendCurrentSegmentText(entry, block.text);
            wsSend(entry.ws, { type: 'text_delta', sessionId, text: block.text }, true);
          } else if (block.type === 'tool_use') {
            const toolInput = sanitizeToolInput(block.name, block.input);
            const tc = { name: block.name, id: block.id, input: toolInput, done: false };
            if (entry.toolCalls.length < MAX_TOOL_CALLS) entry.toolCalls.push(tc);
            else entry.toolCallsTruncated = true;
            attachToolToCurrentSegment(entry, tc);
            wsSend(entry.ws, { type: 'tool_start', sessionId, name: block.name, toolUseId: block.id, input: tc.input });
          } else if (block.type === 'tool_result') {
            const resultText = typeof block.content === 'string'
              ? block.content
              : Array.isArray(block.content)
                ? block.content.map((c) => c.text || '').join('\n')
                : JSON.stringify(block.content);
            const tc = entry.toolCalls.find((t) => t.id === block.tool_use_id);
            if (tc) {
              tc.done = true;
              tc.result = resultText.slice(0, 2000);
            }
            wsSend(entry.ws, { type: 'tool_end', sessionId, toolUseId: block.tool_use_id, result: resultText.slice(0, 2000) });
          }
        }

        if (event.session_id) {
          const session = loadSession(sessionId);
          if (session && !session.claudeSessionId) {
            session.claudeSessionId = event.session_id;
            saveSession(session);
          }
        }

        break;
      }

      case 'result': {
        const session = loadSession(sessionId);
        if (session) {
          if (event.session_id) session.claudeSessionId = event.session_id;
          if (event.total_cost_usd) session.totalCost = (session.totalCost || 0) + event.total_cost_usd;
          saveSession(session);
        }
        entry.lastCost = event.total_cost_usd || null;
        if (entry.ws && event.total_cost_usd !== undefined) {
          wsSend(entry.ws, { type: 'cost', sessionId, costUsd: session?.totalCost || 0 }, true);
        }
        break;
      }
    }
  }

  function processCodexEvent(entry, event, sessionId) {
    if (!event || !event.type) return;

    switch (event.type) {
      case 'thread.started': {
        if (!event.thread_id) break;
        const session = loadSession(sessionId);
        if (session) {
          setRuntimeSessionId(session, event.thread_id);
          if (entry.codexHomeDir) session.codexHomeDir = entry.codexHomeDir;
          if (entry.codexRuntimeKey) session.codexRuntimeKey = entry.codexRuntimeKey;
          saveSession(session);
        }
        break;
      }

      case 'item.started': {
        const item = event.item;
        if (!item || !item.id || item.type === 'agent_message') break;
        ensureCodexToolCall(entry, item, sessionId);
        break;
      }

      case 'item.completed': {
        const item = event.item;
        if (!item || !item.id) break;
	        if (item.type === 'agent_message') {
	          if (item.text) {
	            const update = appendCodexAgentMessage(entry, item.text);
	            if (Array.isArray(update?.events)) {
	              for (const event of update.events) {
	                if (event.type === 'assistant_segment_start') {
	                  wsSend(entry.ws, { type: 'assistant_segment_start', sessionId, prefix: event.prefix || '' });
	                } else if (event.type === 'text_delta') {
	                  wsSend(entry.ws, { type: 'text_delta', sessionId, text: event.text || '' }, true);
	                }
	              }
	            }
	          }
	          break;
	        }
        const tc = ensureCodexToolCall(entry, item, sessionId);
        const resultText = codexToolResult(item).slice(0, 2000);
        tc.done = true;
        tc.result = resultText;
        wsSend(entry.ws, {
          type: 'tool_end',
          sessionId,
          toolUseId: item.id,
          result: resultText,
          kind: tc.kind,
          meta: tc.meta,
        });
        break;
      }

      case 'turn.completed': {
        const usage = event.usage || null;
        const session = loadSession(sessionId);
        if (session && usage) {
          const totalUsage = normalizeUsageSnapshot(usage, 'total');
          session.totalUsage = mergeUsageTotals(session.totalUsage, totalUsage);
          saveSession(session);
          wsSend(entry.ws, {
            type: 'usage',
            sessionId,
            totalUsage: session.totalUsage,
            contextWindowTokens: session.contextWindowTokens || null,
          }, true);
        }
        break;
      }

      case 'turn.failed': {
        const message = event.error?.message || 'Codex 任务失败';
        entry.lastError = message;
        break;
      }

      case 'error':
        if (event.message) {
          if (/^Reconnecting\.\.\./.test(event.message)) {
            wsSend(entry.ws, { type: 'system_message', sessionId, message: event.message });
          } else {
            entry.lastError = event.message;
          }
        }
        break;
    }
  }

  function processCodexRolloutEntry(entry, rolloutEntry, sessionId) {
    if (!rolloutEntry || typeof rolloutEntry !== 'object') return;

    if (rolloutEntry.type === 'turn_context') {
      const payload = rolloutEntry.payload || {};
      const session = loadSession(sessionId);
      if (session) {
        let changed = false;
        const model = String(payload.model || '').trim();
        const reasoningEffort = String(
          payload.effort ||
          payload.collaboration_mode?.settings?.reasoning_effort ||
          ''
        ).trim().toLowerCase();
        if (model && session.model !== model) {
          session.model = model;
          changed = true;
        }
        if (reasoningEffort && session.reasoningEffort !== reasoningEffort) {
          session.reasoningEffort = reasoningEffort;
          changed = true;
        }
        if (changed) {
          saveSession(session);
          wsSend(entry.ws, {
            type: 'model_changed',
            sessionId,
            model: session.model || model,
            reasoningEffort: session.reasoningEffort || reasoningEffort || '',
          });
        }
      }
      return;
    }

    if (rolloutEntry.type !== 'event_msg') return;
    const payload = rolloutEntry.payload || {};
    if (payload.type === 'task_started') {
      const contextWindowTokens = Number(payload.model_context_window || 0);
      if (contextWindowTokens > 0) {
        persistCodexContextTelemetry(entry, sessionId, { contextWindowTokens });
      }
      return;
    }
    if (payload.type !== 'token_count') return;

    const info = payload.info || null;
    if (!info || typeof info !== 'object') return;

    const contextWindowTokens = Number(info.model_context_window || 0);
    const totalUsage = info.total_token_usage
      ? normalizeUsageSnapshot(info.total_token_usage, 'total')
      : info.last_token_usage
        ? normalizeUsageSnapshot(info.last_token_usage, 'total')
        : null;
    const lastUsage = info.last_token_usage
      ? buildCodexContextUsageSnapshot(info.last_token_usage, contextWindowTokens)
      : null;

    if (!totalUsage && !lastUsage && contextWindowTokens <= 0) return;
    persistCodexContextTelemetry(entry, sessionId, {
      totalUsage,
      lastUsage,
      contextWindowTokens,
    });
  }

  function processRuntimeEvent(entry, event, sessionId) {
    if (entry.agent === 'codex') processCodexEvent(entry, event, sessionId);
    else processClaudeEvent(entry, event, sessionId);
  }

  return {
    buildClaudeSpawnSpec,
    buildCodexSpawnSpec,
    processClaudeEvent,
    processCodexEvent,
    processCodexRolloutEntry,
    processRuntimeEvent,
  };
}

module.exports = { createAgentRuntime };
