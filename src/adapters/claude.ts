// Tested against Claude Code 2.1.304 (`claude -p … --output-format json`).
import type { AdapterResult, SpawnAdapter } from '../types.ts';
import { instruction, isRateLimit } from './util.ts';

interface ClaudeResult {
  is_error?: boolean;
  api_error_status?: number;
  result?: string;
  usage?: { input_tokens?: number; output_tokens?: number; cache_creation_input_tokens?: number; cache_read_input_tokens?: number };
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
    let j: ClaudeResult;
    try {
      j = JSON.parse(stdout);
    } catch {
      const limited = isRateLimit(stderr) || isRateLimit(stdout);
      return { text: '', tokensIn: 0, tokensOut: 0, rateLimited: limited, error: stderr.trim() || `claude output is not JSON (exit ${code})` };
    }
    const u = j.usage ?? {};
    // cache tokens count toward the 5-hour window, so they are part of what went in
    const tokensIn = (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0);
    const text = j.result ?? '';
    const rateLimited = j.api_error_status === 429 || (!!j.is_error && isRateLimit(text)) || isRateLimit(stderr);
    const reset = /\|(\d{9,})\s*$/.exec(text);
    return {
      text,
      tokensIn,
      tokensOut: u.output_tokens ?? 0,
      rateLimited,
      ...(reset ? { resetAt: new Date(Number(reset[1]) * 1000).toISOString() } : {}),
      ...(j.is_error ? { error: text || `claude reported an error (exit ${code})` } : {}),
    };
  },
};
