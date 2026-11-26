// Tested against Antigravity CLI 1.5.18 (`agy -p … --output-format json`).
import type { AdapterResult, SpawnAdapter } from '../types.ts';
import { instruction, isRateLimit, retryAfter, snippet } from './util.ts';

interface AgyOut {
  conversation_id?: string;
  status?: string;
  response?: unknown;
  error?: string | { message?: unknown; code?: unknown };
  usage?: {
    input_tokens?: unknown;
    output_tokens?: unknown;
    thinking_tokens?: unknown;
    cache_read_tokens?: unknown;
    total_tokens?: unknown;
  };
}

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

export const agy: SpawnAdapter = {
  kind: 'spawn',
  bin: 'agy',
  args: (promptFile, model) => [
    '-p', instruction(promptFile),
    '--output-format', 'json',
    '--mode', 'accept-edits',
    '--disable-slash-commands',
    ...(model ? ['--model', model] : []),
  ],
  parse(stdout, stderr, code): AdapterResult {
    let j: AgyOut | null = null;
    try { j = JSON.parse(stdout); } catch { /* handled below */ }
    if (!j || typeof j !== 'object' || Array.isArray(j)) {
      const err = stderr.trim() || `agy output is not JSON (exit ${code}): ${snippet(stdout)}`;
      return { text: '', tokensIn: 0, tokensOut: 0, rateLimited: code !== 0 && (isRateLimit(err) || isRateLimit(stdout)), error: err };
    }
    const u = j.usage ?? {};
    // output_tokens already includes thinking_tokens (total_tokens = input_tokens + output_tokens)
    const tokensIn = num(u.input_tokens) + num(u.cache_read_tokens);
    const tokensOut = num(u.output_tokens);
    const text = typeof j.response === 'string' ? j.response : '';
    const errObj = typeof j.error === 'object' && j.error !== null ? j.error : undefined;
    const errMsg = typeof j.error === 'string'
      ? j.error
      : typeof errObj?.message === 'string' ? errObj.message : '';
    const badStatus = typeof j.status === 'string' && j.status.toUpperCase() !== 'SUCCESS';
    const errored = badStatus || j.error !== undefined || code !== 0;
    const err = errored
      ? errMsg || stderr.trim() || `agy failed (status ${j.status ?? 'unknown'}, exit ${code})`
      : '';
    const rateLimited = errored && (
      errObj?.code === 429 ||
      j.status?.toUpperCase() === 'RATE_LIMITED' ||
      isRateLimit(err) ||
      (code !== 0 && isRateLimit(stderr))
    );
    const resetAt = rateLimited ? retryAfter(err) : undefined;
    return { text, tokensIn, tokensOut, rateLimited, ...(resetAt ? { resetAt } : {}), ...(err ? { error: err } : {}) };
  },
};
