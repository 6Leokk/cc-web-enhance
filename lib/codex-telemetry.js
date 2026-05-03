function normalizeCodexUsageTotals(usage) {
  if (!usage || typeof usage !== 'object') return null;
  return {
    inputTokens: Number(usage.inputTokens || 0),
    cachedInputTokens: Number(usage.cachedInputTokens || 0),
    outputTokens: Number(usage.outputTokens || 0),
  };
}

function normalizeCodexContextUsageSnapshot(usage, contextWindowTokens = null) {
  if (!usage || typeof usage !== 'object') return null;
  const snapshot = {
    inputTokens: Number(usage.inputTokens || 0),
    cachedInputTokens: Number(usage.cachedInputTokens || 0),
    outputTokens: Number(usage.outputTokens || 0),
    source: 'context',
  };
  const resolvedContextWindowTokens = Number(
    usage.contextWindowTokens || contextWindowTokens || 0,
  );
  if (resolvedContextWindowTokens > 0) {
    snapshot.contextWindowTokens = resolvedContextWindowTokens;
  }
  return snapshot;
}

function hasAnyUsageTotals(usage) {
  return Number(usage?.inputTokens || 0) > 0
    || Number(usage?.cachedInputTokens || 0) > 0
    || Number(usage?.outputTokens || 0) > 0;
}

function isUsageRollback(currentUsage, incomingUsage) {
  if (!hasAnyUsageTotals(currentUsage) || !hasAnyUsageTotals(incomingUsage)) return false;
  return Number(incomingUsage.inputTokens || 0) < Number(currentUsage.inputTokens || 0)
    || Number(incomingUsage.cachedInputTokens || 0) < Number(currentUsage.cachedInputTokens || 0)
    || Number(incomingUsage.outputTokens || 0) < Number(currentUsage.outputTokens || 0);
}

function mergeUsageTotals(currentUsage, incomingUsage) {
  const current = normalizeCodexUsageTotals(currentUsage) || {
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
  };
  const incoming = normalizeCodexUsageTotals(incomingUsage);
  if (!incoming) return current;
  return {
    inputTokens: Math.max(current.inputTokens, incoming.inputTokens),
    cachedInputTokens: Math.max(current.cachedInputTokens, incoming.cachedInputTokens),
    outputTokens: Math.max(current.outputTokens, incoming.outputTokens),
  };
}

function applyCodexParsedTelemetryToSession(session, parsed, rolloutPath = '') {
  if (!session || typeof session !== 'object' || !parsed || typeof parsed !== 'object') {
    return session;
  }

  const model = String(parsed.meta?.model || '').trim();
  if (model) session.model = model;

  const reasoningEffort = String(parsed.meta?.reasoningEffort || '').trim().toLowerCase();
  if (reasoningEffort) session.reasoningEffort = reasoningEffort;

  const currentTotalUsage = normalizeCodexUsageTotals(session.totalUsage);
  const totalUsage = normalizeCodexUsageTotals(parsed.totalUsage);
  const isRollback = isUsageRollback(currentTotalUsage, totalUsage);
  if (totalUsage && !isRollback) {
    session.totalUsage = mergeUsageTotals(currentTotalUsage, totalUsage);
  }

  const contextWindowTokens = Number(
    parsed.contextWindowTokens || parsed.lastUsage?.contextWindowTokens || 0,
  );
  const lastUsage = normalizeCodexContextUsageSnapshot(parsed.lastUsage, contextWindowTokens);
  if (lastUsage && !isRollback) {
    session.lastUsage = lastUsage;
  }
  if (contextWindowTokens > 0 && !isRollback) {
    session.contextWindowTokens = contextWindowTokens;
    if (session.lastUsage && !Number(session.lastUsage.contextWindowTokens || 0)) {
      session.lastUsage.contextWindowTokens = contextWindowTokens;
    }
  }

  const resolvedRolloutPath = String(rolloutPath || parsed.filePath || '').trim();
  if (resolvedRolloutPath && !isRollback) session.importedRolloutPath = resolvedRolloutPath;

  return session;
}

module.exports = {
  applyCodexParsedTelemetryToSession,
};
