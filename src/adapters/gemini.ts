// Gemini CLI `-p … --output-format json` shape. Not yet verified on a real install (see test/fixtures/README.md).
import type { AdapterResult, SpawnAdapter } from '../types.ts';
import { instruction, isRateLimit, retryAfter, snippet } from './util.ts';

interface GeminiOut {
  response?: string;
  stats?: { models?: Record<string, { tokens?: { prompt?: number; candidates?: number; thoughts?: number } }> };
  error?: { message?: string; code?: number };
}

export const gemini: SpawnAdapter = {
  kind: 'spawn',
  bin: 'gemini',
  args: (promptFile, model) => [
    '-p', instruction(promptFile),
    '--output-format', 'json',
    '--yolo',
    ...(model ? ['-m', model] : []),
  ],
  parse(stdout, stderr, code): AdapterResult {
    let j: GeminiOut | null = null;
    try { j = JSON.parse(stdout); } catch { /* handled below */ }
    if (!j || typeof j !== 'object' || Array.isArray(j)) {
      const err = stderr.trim() || `gemini output is not JSON (exit ${code}): ${snippet(stdout)}`;
      return { text: '', tokensIn: 0, tokensOut: 0, rateLimited: code !== 0 && isRateLimit(err), error: err };
    }
    let tokensIn = 0, tokensOut = 0;
    for (const m of Object.values(j.stats?.models ?? {})) {
      tokensIn += m.tokens?.prompt ?? 0;
      tokensOut += (m.tokens?.candidates ?? 0) + (m.tokens?.thoughts ?? 0);
    }
    const err = j.error?.message ?? (code !== 0 ? stderr.trim() || `gemini exited ${code}` : '');
    const rateLimited = j.error?.code === 429 || (!!err && isRateLimit(err));
    const resetAt = rateLimited ? retryAfter(err) : undefined;
    return { text: j.response ?? '', tokensIn, tokensOut, rateLimited, ...(resetAt ? { resetAt } : {}), ...(err ? { error: err } : {}) };
  },
};
