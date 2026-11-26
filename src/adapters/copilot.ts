// Tested against GitHub Copilot CLI 1.0.116 (`copilot -p … --output-format json`).
import { dirname } from 'node:path';
import type { AdapterResult, SpawnAdapter } from '../types.ts';
import { instruction, isRateLimit, retryAfter, snippet } from './util.ts';

interface CopilotEvent {
  type?: string;
  exitCode?: number;
  message?: unknown;
  error?: string | { message?: unknown };
  data?: {
    content?: unknown;
    deltaContent?: unknown;
    message?: unknown;
    result?: unknown;
    error?: unknown;
  };
  usage?: {
    inputTokens?: unknown;
    outputTokens?: unknown;
    input_tokens?: unknown;
    output_tokens?: unknown;
    premiumRequests?: unknown;
  };
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export const copilot: SpawnAdapter = {
  kind: 'spawn',
  bin: 'copilot',
  args: (promptFile, model) => [
    '-p', instruction(promptFile),
    '--output-format', 'json',
    '--allow-all-tools',
    '--trust-folder',
    '--no-ask-user',
    '--add-dir', dirname(promptFile),
    ...(model ? ['--model', model] : []),
  ],
  parse(stdout, stderr, code): AdapterResult {
    const events: CopilotEvent[] = [];
    for (const line of stdout.split('\n')) {
      try {
        const e = JSON.parse(line);
        if (e && typeof e === 'object' && !Array.isArray(e)) events.push(e);
      } catch { /* skip non-JSON lines */ }
    }
    let text = '', delta = '', err = '', notice = '';
    let tokensIn = 0, tokensOut = 0, hasTokens = false;
    let resultEvent: CopilotEvent | undefined;

    for (const e of events) {
      if (e.type === 'assistant.message' && typeof e.data?.content === 'string') text = e.data.content;
      if (e.type === 'assistant.message_delta' && typeof e.data?.deltaContent === 'string') delta += e.data.deltaContent;
      if ((e.type === 'error' || e.type === 'session.error')) {
        const m = typeof e.data?.message === 'string' ? e.data.message : typeof e.message === 'string' ? e.message : '';
        if (m) notice = m;
      }
      if (e.type === 'result') {
        resultEvent = e;
        const u = e.usage;
        if (u) {
          const i = num(u.inputTokens) ?? num(u.input_tokens);
          const o = num(u.outputTokens) ?? num(u.output_tokens);
          if (i !== null || o !== null) {
            tokensIn += i ?? 0;
            tokensOut += o ?? 0;
            hasTokens = true;
          }
        }
        const re = typeof e.error === 'string' ? e.error : typeof e.error?.message === 'string' ? e.error.message : '';
        if (re) err = re;
      }
    }

    if (!text && delta) text = delta;
    const okResult = !!resultEvent && (resultEvent.exitCode === 0 || resultEvent.exitCode === undefined);
    if (!err && notice && (!okResult || code !== 0)) err = notice;
    if (!err && (!okResult || code !== 0)) {
      err = stderr.trim() || `copilot produced no completed result (exit ${resultEvent?.exitCode ?? code}): ${snippet(stdout)}`;
    }
    const rateLimited = !!err && (isRateLimit(err) || (code !== 0 && isRateLimit(stderr)));
    const resetAt = rateLimited ? retryAfter(err) : undefined;
    return {
      text,
      tokensIn,
      tokensOut,
      ...(!hasTokens ? { estimated: true } : {}),
      rateLimited,
      ...(resetAt ? { resetAt } : {}),
      ...(err ? { error: err } : {}),
    };
  },
};
