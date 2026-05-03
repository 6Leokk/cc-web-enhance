const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function createCodexRolloutStore(deps) {
  const { codexSessionsDir, sessionsDir, normalizeSession, sanitizeToolInput } = deps;
  const rolloutParseCache = new Map();

  function statCacheKey(stat) {
    if (!stat || typeof stat !== 'object') return '';
    return `${Number(stat.size || 0)}:${Math.floor(Number(stat.mtimeMs || 0))}`;
  }

  function extractCodexMessageText(content) {
    if (!Array.isArray(content)) return '';
    return content
      .filter((item) => item && (item.type === 'input_text' || item.type === 'output_text'))
      .map((item) => item.text || '')
      .join('');
  }

  function appendAssistantContent(turn, text) {
    if (!turn || !text || !text.trim()) return;
    turn.content = turn.content ? `${turn.content}\n\n${text}` : text;
  }

  function parseCodexRolloutLines(lines) {
    const messages = [];
    const pendingToolCalls = new Map();
    const meta = { threadId: null, cwd: null, title: '', updatedAt: null, cliVersion: null, source: null, model: '', reasoningEffort: '' };
    const totalUsage = { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 };
    let lastUsage = null;
    let contextWindowTokens = null;
    let currentAssistant = null;
    let sawRealUserMessage = false;
    const fallbackUserMessages = [];

    function ensureAssistant(ts) {
      if (!currentAssistant) {
        currentAssistant = { role: 'assistant', content: '', toolCalls: [], timestamp: ts || null };
      } else if (!currentAssistant.timestamp && ts) {
        currentAssistant.timestamp = ts;
      }
      return currentAssistant;
    }

    function flushAssistant() {
      if (!currentAssistant) return;
      if ((currentAssistant.content || '').trim() || currentAssistant.toolCalls.length > 0) {
        messages.push(currentAssistant);
      }
      currentAssistant = null;
      pendingToolCalls.clear();
    }

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      let entry;
      try { entry = JSON.parse(trimmed); } catch { continue; }
      const ts = entry.timestamp || null;
      if (ts) meta.updatedAt = ts;

      if (entry.type === 'session_meta') {
        meta.threadId = entry.payload?.id || meta.threadId;
        meta.cwd = entry.payload?.cwd || meta.cwd;
        meta.cliVersion = entry.payload?.cli_version || meta.cliVersion;
        meta.source = entry.payload?.source || meta.source;
        continue;
      }

      if (entry.type === 'turn_context') {
        const payload = entry.payload || {};
        meta.model = String(payload.model || meta.model || '').trim();
        meta.reasoningEffort = String(
          payload.effort ||
          payload.collaboration_mode?.settings?.reasoning_effort ||
          meta.reasoningEffort ||
          ''
        ).trim().toLowerCase();
        continue;
      }

      if (entry.type === 'event_msg' && entry.payload?.type === 'token_count') {
        const total = entry.payload?.info?.total_token_usage || null;
        const usage = entry.payload?.info?.last_token_usage || null;
        const contextWindow = Number(entry.payload?.info?.model_context_window || 0);
        if (Number.isFinite(contextWindow) && contextWindow > 0) contextWindowTokens = contextWindow;
        if (total) {
          totalUsage.inputTokens = Math.max(totalUsage.inputTokens, total.input_tokens || 0);
          totalUsage.cachedInputTokens = Math.max(totalUsage.cachedInputTokens, total.cached_input_tokens || 0);
          totalUsage.outputTokens = Math.max(totalUsage.outputTokens, total.output_tokens || 0);
        } else if (usage) {
          totalUsage.inputTokens += usage.input_tokens || 0;
          totalUsage.cachedInputTokens += usage.cached_input_tokens || 0;
          totalUsage.outputTokens += usage.output_tokens || 0;
        }
        if (usage) {
          lastUsage = {
            inputTokens: usage.input_tokens || 0,
            cachedInputTokens: usage.cached_input_tokens || 0,
            outputTokens: usage.output_tokens || 0,
            source: 'context',
            contextWindowTokens: contextWindowTokens || null,
          };
        }
        continue;
      }

      if (entry.type === 'event_msg' && entry.payload?.type === 'task_started') {
        const contextWindow = Number(entry.payload?.model_context_window || 0);
        if (Number.isFinite(contextWindow) && contextWindow > 0) contextWindowTokens = contextWindow;
        continue;
      }

      if (entry.type === 'event_msg' && entry.payload?.type === 'user_message') {
        const text = String(entry.payload?.message || '').trim();
        if (text) {
          sawRealUserMessage = true;
          flushAssistant();
          if (!meta.title) meta.title = text.slice(0, 80).replace(/\n/g, ' ');
          messages.push({ role: 'user', content: text, timestamp: ts });
        }
        continue;
      }

      if (entry.type !== 'response_item') continue;

      const payload = entry.payload || {};
      switch (payload.type) {
      case 'message': {
        if (payload.role === 'assistant') {
          const text = extractCodexMessageText(payload.content);
          if (text.trim()) {
            if (currentAssistant && ((currentAssistant.content || '').trim() || currentAssistant.toolCalls.length > 0)) {
              flushAssistant();
            }
            appendAssistantContent(ensureAssistant(ts), text);
          }
        } else if (payload.role === 'user' && !sawRealUserMessage) {
          const text = extractCodexMessageText(payload.content);
          if (text.trim()) {
              fallbackUserMessages.push({ role: 'user', content: text, timestamp: ts });
          }
        }
        break;
      }
        case 'function_call': {
          const assistant = ensureAssistant(ts);
          const toolUseId = payload.call_id || payload.id || crypto.randomUUID();
          const tc = {
            name: payload.name || 'FunctionCall',
            id: toolUseId,
            input: sanitizeToolInput(payload.name || 'FunctionCall', payload.arguments || ''),
            done: false,
          };
          assistant.toolCalls.push(tc);
          pendingToolCalls.set(toolUseId, tc);
          break;
        }
        case 'function_call_output': {
          const assistant = ensureAssistant(ts);
          const toolUseId = payload.call_id || crypto.randomUUID();
          let tc = pendingToolCalls.get(toolUseId);
          if (!tc) {
            tc = { name: 'FunctionCall', id: toolUseId, input: null, done: false };
            assistant.toolCalls.push(tc);
            pendingToolCalls.set(toolUseId, tc);
          }
          tc.done = true;
          tc.result = (typeof payload.output === 'string'
            ? payload.output
            : JSON.stringify(payload.output || '')).slice(0, 2000);
          break;
        }
        default:
          break;
      }
    }

    flushAssistant();
    if (!sawRealUserMessage && fallbackUserMessages.length > 0) {
      const fallback = fallbackUserMessages[0];
      if (!meta.title) meta.title = fallback.content.trim().slice(0, 80).replace(/\n/g, ' ');
      return { meta, messages: fallbackUserMessages.concat(messages), totalUsage, lastUsage, contextWindowTokens };
    }
    return { meta, messages, totalUsage, lastUsage, contextWindowTokens };
  }

  function walkFiles(dir, files = []) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return files;
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) walkFiles(fullPath, files);
      else if (entry.isFile()) files.push(fullPath);
    }
    return files;
  }

  function getCodexRolloutFiles() {
    if (!fs.existsSync(codexSessionsDir)) return [];
    return walkFiles(codexSessionsDir, []).filter((filePath) => filePath.endsWith('.jsonl')).sort().reverse();
  }

  function getCachedParsedRollout(filePath) {
    let stat;
    try {
      stat = fs.statSync(filePath);
    } catch {
      rolloutParseCache.delete(filePath);
      return null;
    }
    if (!stat.isFile()) {
      rolloutParseCache.delete(filePath);
      return null;
    }
    const key = statCacheKey(stat);
    const cached = rolloutParseCache.get(filePath);
    if (cached?.key === key) return cached.parsed;
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const parsed = parseCodexRolloutLines(content.split('\n'));
      parsed.filePath = filePath;
      rolloutParseCache.set(filePath, { key, parsed });
      return parsed;
    } catch {
      rolloutParseCache.delete(filePath);
      return null;
    }
  }

  function listCodexSessions() {
    const items = [];
    const seen = new Set();
    for (const filePath of getCodexRolloutFiles()) {
      const parsed = getCachedParsedRollout(filePath);
      if (!parsed?.meta?.threadId) continue;
      if (seen.has(parsed.meta.threadId)) continue;
      seen.add(parsed.meta.threadId);
      const title = parsed.meta.title || parsed.meta.threadId.slice(0, 20);
      items.push({
        threadId: parsed.meta.threadId,
        title,
        cwd: parsed.meta.cwd || null,
        updatedAt: parsed.meta.updatedAt || null,
        cliVersion: parsed.meta.cliVersion || '',
        source: parsed.meta.source || '',
        rolloutPath: filePath,
      });
    }
    return items;
  }

  function findCodexRolloutPathByThreadId(threadId) {
    const targetThreadId = String(threadId || '').trim();
    if (!targetThreadId) return '';
    for (const item of listCodexSessions()) {
      if (item.threadId === targetThreadId) return item.rolloutPath;
    }
    return '';
  }

  function getImportedCodexThreadIds() {
    const imported = new Set();
    try {
      for (const f of fs.readdirSync(sessionsDir).filter((name) => name.endsWith('.json'))) {
        try {
          const session = normalizeSession(JSON.parse(fs.readFileSync(path.join(sessionsDir, f), 'utf8')));
          if (session.codexThreadId) imported.add(session.codexThreadId);
        } catch {}
      }
    } catch {}
    return imported;
  }

  function parseCodexRolloutFile(filePath) {
    return getCachedParsedRollout(filePath);
  }

  return {
    parseCodexRolloutLines,
    getCodexRolloutFiles,
    getImportedCodexThreadIds,
    listCodexSessions,
    findCodexRolloutPathByThreadId,
    parseCodexRolloutFile,
  };
}

module.exports = { createCodexRolloutStore };
