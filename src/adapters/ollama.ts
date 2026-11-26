// Ollama local API (POST /api/chat, stream:false). No account, no quota: never rate limited.
// Code-writing roles never route here (enforced by the engine); this adapter only returns text.
import type { AdapterResult, HttpAdapter } from '../types.ts';

const fail = (error: string): AdapterResult => ({ text: '', tokensIn: 0, tokensOut: 0, rateLimited: false, error });

export function ollamaAdapter(base = process.env.OLLAMA_HOST || 'http://localhost:11434'): HttpAdapter & { baseUrl: string } {
  const baseUrl = base.replace(/\/+$/, '');
  return {
    kind: 'http',
    baseUrl,
    async call(prompt, model, signal) {
      let res: Response;
      try {
        res = await fetch(`${baseUrl}/api/chat`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ model, stream: false, messages: [{ role: 'user', content: prompt }], options: { num_ctx: 8192 } }),
          signal,
        });
      } catch (e) {
        if (signal.aborted) return fail(`Ollama request cancelled or timed out (${model})`);
        return fail(`Ollama not running at ${baseUrl}`);
      }
      let body: string;
      try { body = await res.text(); } catch { return fail(`Ollama request cancelled or timed out (${model})`); }
      if (res.status === 404) return fail(`Ollama has no model "${model}"; run: ollama pull ${model}`);
      if (!res.ok) return fail(`Ollama returned HTTP ${res.status}: ${body.trim().slice(0, 200)}`);
      let j: { message?: { content?: unknown }; prompt_eval_count?: unknown; eval_count?: unknown; error?: unknown };
      try { j = JSON.parse(body); } catch { return fail(`Ollama response is not JSON: ${body.trim().slice(0, 200)}`); }
      if (!j || typeof j !== 'object') return fail('Ollama response is not an object');
      if (typeof j.error === 'string') return fail(`Ollama error: ${j.error}`);
      return {
        text: typeof j.message?.content === 'string' ? j.message.content : '',
        tokensIn: Number(j.prompt_eval_count) || 0,
        tokensOut: Number(j.eval_count) || 0,
        rateLimited: false,
      };
    },
  };
}

export const ollama = ollamaAdapter();
