function extractClaudeTextBlocks(raw) {
  if (typeof raw === 'string') return raw;
  if (!Array.isArray(raw)) return '';
  return raw
    .filter((block) => block && block.type === 'text')
    .map((block) => block.text || '')
    .join('');
}

function normalizeClaudeCachedTokens(usage) {
  if (!usage || typeof usage !== 'object') return 0;
  return Number(usage.cache_read_input_tokens || 0) + Number(usage.cache_creation_input_tokens || 0);
}

function buildClaudeContextUsageSnapshot(usage) {
  if (!usage || typeof usage !== 'object') return null;
  const cachedInputTokens = normalizeClaudeCachedTokens(usage);
  return {
    inputTokens: Number(usage.input_tokens || 0) + cachedInputTokens,
    cachedInputTokens,
    outputTokens: Number(usage.output_tokens || 0),
    source: 'context',
  };
}

function parseClaudeTranscriptLines(lines) {
  const messages = [];
  const meta = { title: '', cwd: null, updatedAt: null };
  const totalUsage = { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 };
  let lastUsage = null;
  let latestContextTimestamp = null;

  for (const line of lines) {
    const trimmed = String(line || '').trim();
    if (!trimmed) continue;
    let entry;
    try {
      entry = JSON.parse(trimmed);
    } catch {
      continue;
    }

    const timestamp = entry.timestamp || null;
    if (timestamp) meta.updatedAt = timestamp;

    if (entry.type === 'user') {
      const content = extractClaudeTextBlocks(entry.message?.content);
      if (!meta.cwd && entry.cwd) meta.cwd = entry.cwd;
      if (content.trim()) {
        if (!meta.title) meta.title = content.trim().slice(0, 80).replace(/\n/g, ' ');
        messages.push({ role: 'user', content, timestamp });
      }
      continue;
    }

    if (entry.type !== 'assistant') continue;

    const blocks = entry.message?.content;
    if (Array.isArray(blocks)) {
      let content = '';
      const toolCalls = [];
      for (const block of blocks) {
        if (block.type === 'text' && block.text) {
          content += block.text;
        } else if (block.type === 'tool_use') {
          toolCalls.push({ name: block.name, id: block.id, input: block.input, done: true });
        }
      }
      if (content.trim() || toolCalls.length > 0) {
        messages.push({ role: 'assistant', content, toolCalls, timestamp });
      }
    }

    const usage = entry.message?.usage;
    if (usage && typeof usage === 'object') {
      totalUsage.inputTokens += Number(usage.input_tokens || 0);
      totalUsage.cachedInputTokens += normalizeClaudeCachedTokens(usage);
      totalUsage.outputTokens += Number(usage.output_tokens || 0);
      if (entry.isSidechain !== true && !entry.isApiErrorMessage && timestamp) {
        const entryTime = new Date(timestamp);
        if (!Number.isNaN(entryTime.getTime()) && (!latestContextTimestamp || entryTime > latestContextTimestamp)) {
          latestContextTimestamp = entryTime;
          lastUsage = buildClaudeContextUsageSnapshot(usage);
        }
      }
    }
  }

  return { meta, messages, totalUsage, lastUsage };
}

module.exports = {
  buildClaudeContextUsageSnapshot,
  parseClaudeTranscriptLines,
};
