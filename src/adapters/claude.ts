// Tested against Claude Code 2.1.304 (`claude -p … --output-format json`).
import type { AdapterResult, SpawnAdapter } from '../types.ts';
import { instruction, isRateLimit } from './util.ts';

interface ClaudeResult {
  type?: string;
  is_error?: boolean;
  api_error_status?: number | null;
  result?: string;
  usage?: { input_tokens?: number; output_tokens?: number; cache_creation_input_tokens?: number; cache_read_input_tokens?: number };
}

const WEEK_MS = 7 * 24 * 3600 * 1000;

// "…|<unix seconds>" at the end of a limit message; ignored unless it lands within a week
function resetFrom(text: string): string | undefined {
  const m = /\|(\d{9,11})\s*$/.exec(text);
  if (!m) return undefined;
  const t = Number(m[1]) * 1000;
  return Number.isFinite(t) && t > Date.now() - WEEK_MS && t < Date.now() + WEEK_MS ? new Date(t).toISOString() : undefined;
}

export const claude: SpawnAdapter = {
  kind: 'spawn',
  bin: 'claude',
  args: (promptFile, model) => [
    '-p', instruction(promptFile),
    '--output-format', 'json',
    '--permission-mode', 'acceptEdits',
    ...(model ? ['--model', model] : []),
  ],
  parse(stdout, stderr, code): AdapterResult {
    const failed = (): AdapterResult => ({
      text: '', tokensIn: 0, tokensOut: 0,
      rateLimited: isRateLimit(stderr) || isRateLimit(stdout),
      error: stderr.trim() || `claude output is not a result object (exit ${code}): ${stdout.trim().slice(0, 200)}`,
    });
    let j: ClaudeResult;
    try {
      j = JSON.parse(stdout);
    } catch {
      return failed();
    }
    if (!j || typeof j !== 'object' || Array.isArray(j) || j.type !== 'result') return failed();

    const u = j.usage ?? {};
    // cache tokens count toward the 5-hour window, so they are part of what went in
    const tokensIn = (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0);
    const text = j.result ?? '';
    const errored = !!j.is_error || code !== 0;
    // stderr only counts when the run failed: warnings on a good run must not pause the vendor
    const rateLimited = j.api_error_status === 429 || (errored && (isRateLimit(text) || isRateLimit(stderr)));
    const resetAt = rateLimited ? resetFrom(text) : undefined;
    return {
      text,
      tokensIn,
      tokensOut: u.output_tokens ?? 0,
      rateLimited,
      ...(resetAt ? { resetAt } : {}),
      ...(j.is_error ? { error: text || `claude reported an error (exit ${code})` } : {}),
    };
  },
};
