// Tested against codex-cli 0.154.0 (`codex exec --json`). The runner must close stdin:
// codex exec otherwise waits on "Reading additional input from stdin...".
import type { AdapterResult, SpawnAdapter } from '../types.ts';
import { instruction, isRateLimit, retryAfter, snippet } from './util.ts';

interface CodexEvent {
  type?: string;
  message?: string;
  error?: { message?: string };
  item?: { type?: string; text?: string };
  usage?: { input_tokens?: number; cached_input_tokens?: number; output_tokens?: number };
}

export const codex: SpawnAdapter = {
  kind: 'spawn',
  bin: 'codex',
  args: (promptFile, model) => [
    'exec', '--json', '--full-auto', '--skip-git-repo-check',
    ...(model ? ['-m', model] : []),
    instruction(promptFile),
  ],
  parse(stdout, stderr, code): AdapterResult {
    const events: CodexEvent[] = [];
    for (const line of stdout.split('\n')) {
      try {
        const e = JSON.parse(line);
        if (e && typeof e === 'object' && !Array.isArray(e)) events.push(e);
      } catch { /* skip non-JSON lines */ }
    }
    let text = '', tokensIn = 0, tokensOut = 0, err = '', notice = '';
    for (const e of events) {
      if (e.type === 'item.completed' && e.item?.type === 'agent_message') text = e.item.text ?? '';
      // input_tokens already includes the cached part
      if (e.type === 'turn.completed' && e.usage) { tokensIn += e.usage.input_tokens ?? 0; tokensOut += e.usage.output_tokens ?? 0; }
      if (e.type === 'error' && e.message) notice = e.message;
      if (e.type === 'turn.failed' && e.error?.message) err = e.error.message;
    }
    const completed = events.some(e => e.type === 'turn.completed');
    // error events can be retry notices; they only count when the turn did not complete
    if (!err && notice && (!completed || code !== 0)) err = notice;
    if (!err && (!completed || code !== 0)) err = stderr.trim() || `codex produced no completed turn (exit ${code}): ${snippet(stdout)}`;
    // stderr only counts when the run failed
    const rateLimited = !!err && (isRateLimit(err) || (code !== 0 && /\b429\b|rate.?limit/i.test(stderr)));
    const resetAt = rateLimited ? retryAfter(err) : undefined;
    return { text, tokensIn, tokensOut, rateLimited, ...(resetAt ? { resetAt } : {}), ...(err ? { error: err } : {}) };
  },
};
