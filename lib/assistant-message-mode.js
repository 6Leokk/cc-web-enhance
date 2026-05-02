const VALID_ASSISTANT_MESSAGE_MODES = new Set(['segmented', 'single']);
const DEFAULT_ASSISTANT_MESSAGE_MODE = 'segmented';

function normalizeAssistantMessageMode(mode) {
  return VALID_ASSISTANT_MESSAGE_MODES.has(mode) ? mode : DEFAULT_ASSISTANT_MESSAGE_MODE;
}

function cloneToolCall(tool) {
  if (!tool || typeof tool !== 'object') return tool;
  return { ...tool };
}

function cloneToolCalls(toolCalls) {
  return Array.isArray(toolCalls) ? toolCalls.map(cloneToolCall) : [];
}

function normalizeAssistantSegment(segment) {
  if (!segment || typeof segment !== 'object') return null;
  const content = String(segment.content || '');
  const toolCalls = cloneToolCalls(segment.toolCalls);
  if (!content.trim() && toolCalls.length === 0) return null;
  return { content, toolCalls };
}

function completionFlags(entry) {
  const flags = {};
  if (entry?.fullTextTruncated) flags.truncated = true;
  if (entry?.toolCallsTruncated) flags.toolCallsTruncated = true;
  return flags;
}

function buildSingleCompletionMessage(entry, timestamp) {
  const content = String(entry?.fullText || '');
  const toolCalls = cloneToolCalls(entry?.toolCalls);
  if (!content.trim() && toolCalls.length === 0) return [];
  return [{
    role: 'assistant',
    content,
    toolCalls,
    timestamp,
    ...completionFlags(entry),
  }];
}

function buildSegmentedCompletionMessages(entry, timestamp) {
  const segments = Array.isArray(entry?.assistantSegments)
    ? entry.assistantSegments.map(normalizeAssistantSegment).filter(Boolean)
    : [];
  if (segments.length === 0) return buildSingleCompletionMessage(entry, timestamp);
  return segments.map((segment, index) => ({
    role: 'assistant',
    content: segment.content,
    toolCalls: segment.toolCalls,
    timestamp,
    ...(index === segments.length - 1 ? completionFlags(entry) : {}),
  }));
}

function buildAssistantCompletionMessages(entry, mode, timestamp = new Date().toISOString()) {
  const normalized = normalizeAssistantMessageMode(mode);
  if (normalized === 'single') return buildSingleCompletionMessage(entry, timestamp);
  return buildSegmentedCompletionMessages(entry, timestamp);
}

module.exports = {
  DEFAULT_ASSISTANT_MESSAGE_MODE,
  buildAssistantCompletionMessages,
  normalizeAssistantMessageMode,
};
