// Ollama local API (POST /api/chat, stream:false). No account, no quota: never rate limited.
// Code-writing roles never route here (enforced by the engine); this adapter only returns text.
import type { AdapterResult, HttpAdapter } from '../types.ts';

const NUM_CTX = 8192;
const fail = (error: string): AdapterResult => ({ text: '', tokensIn: 0, tokensOut: 0, rateLimited: false, error });

// OLLAMA_HOST is Ollama's own server variable and is usually written without a scheme
export function normalizeHost(raw: string): string {
  let h = raw.trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(h)) h = 'http://' + h;
  const u = new URL(h);
  if (u.hostname === '0.0.0.0') u.hostname = 'localhost';
  if (!u.port && u.protocol === 'http:' && !/:\d+$/.test(h)) u.port = '11434';
  return u.toString().replace(/\/+$/, '');
}

export function describeFetchError(e: unknown, baseUrl: string): string {
  const code = (e as { cause?: { code?: string } })?.cause?.code;
  // undici gives up waiting for headers after 300s; with stream:false that is the whole generation
  if (code === 'UND_ERR_HEADERS_TIMEOUT') return `Ollama took more than 300s to respond at ${baseUrl}`;
  return `Ollama not running at ${baseUrl}${code ? ` (${code})` : ''}`;
}

export function ollamaAdapter(base = process.env.OLLAMA_HOST || 'http://localhost:11434'): HttpAdapter & { baseUrl: string } {
  const baseUrl = normalizeHost(base);
  return {
    kind: 'http',
    baseUrl,
    async call(prompt, model, signal) {
      // ponytail: ~3 chars per token estimate; Ollama silently drops the start of an over-long prompt
      const estTokens = Math.ceil(prompt.length / 3);
      if (estTokens > NUM_CTX * 0.9) return fail(`prompt too large for Ollama num_ctx ${NUM_CTX} (~${estTokens} tokens); split the context or use another vendor`);
      let res: Response;
      try {
        res = await fetch(`${baseUrl}/api/chat`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ model, stream: false, messages: [{ role: 'user', content: prompt }], options: { num_ctx: NUM_CTX } }),
          signal,
        });
      } catch (e) {
        if (signal.aborted) return fail(`Ollama request cancelled or timed out (${model})`);
        return fail(describeFetchError(e, baseUrl));
      }
      let body: string;
      try { body = await res.text(); } catch {
        return fail(signal.aborted ? `Ollama request cancelled or timed out (${model})` : `Ollama connection lost while answering (${model})`);
      }
      if (res.status === 404) return fail(`Ollama has no model "${model}"; run: ollama pull ${model}`);
      if (!res.ok) return fail(`Ollama returned HTTP ${res.status}: ${body.trim().slice(0, 200)}`);
      let j: { message?: { content?: unknown }; prompt_eval_count?: unknown; eval_count?: unknown; error?: unknown };
      try { j = JSON.parse(body); } catch { return fail(`Ollama response is not JSON: ${body.trim().slice(0, 200)}`); }
      if (!j || typeof j !== 'object') return fail('Ollama response is not an object');
      if (typeof j.error === 'string') return fail(`Ollama error: ${j.error}`);
      if (typeof j.message?.content !== 'string') return fail('Ollama reply has no message content');
      return {
        text: j.message.content,
        tokensIn: Number(j.prompt_eval_count) || 0,
        tokensOut: Number(j.eval_count) || 0,
        rateLimited: false,
      };
    },
  };
}

// reads OLLAMA_HOST once at import; fine for a CLI process
export const ollama = ollamaAdapter();
