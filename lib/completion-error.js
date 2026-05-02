function shouldTreatCompletionAsError(exitCode, signal, stderrSnippet, options = {}) {
  const raw = String(stderrSnippet || '').trim();
  const hasResponseText = !!options.hasResponseText;
  const contextLimitExceeded = !!options.contextLimitExceeded;
  if (contextLimitExceeded) return true;
  if (typeof exitCode === 'number') return exitCode !== 0;
  if (signal && signal !== 'SIGTERM' && signal !== 'unknown (detected by monitor)') return true;
  if (!raw) return false;
  if (hasResponseText && signal === 'unknown (detected by monitor)') return false;
  if (!hasResponseText && signal === 'unknown (detected by monitor)') return true;
  return false;
}

module.exports = { shouldTreatCompletionAsError };
