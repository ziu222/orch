import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { getAdapter } from '../src/adapters/index.ts';
import { ollamaAdapter, describeFetchError, normalizeHost } from '../src/adapters/ollama.ts';
import type { HttpAdapter } from '../src/types.ts';

// fake Ollama: replies by model name
function fake(): Promise<{ url: string; server: Server; bodies: unknown[] }> {
  const bodies: unknown[] = [];
  const server = createServer((req, res) => {
    let raw = '';
    req.on('data', c => (raw += c));
    req.on('end', () => {
      const body = JSON.parse(raw || '{}');
      bodies.push(body);
      if (req.url !== '/api/chat') { res.writeHead(404).end(); return; }
      if (body.model === 'missing:1b') { res.writeHead(404, { 'content-type': 'application/json' }).end(JSON.stringify({ error: "model 'missing:1b' not found" })); return; }
      if (body.model === 'busy') { res.writeHead(503).end('server busy'); return; }
      if (body.model === 'slow') return; // never answers
      res.writeHead(200, { 'content-type': 'application/json' })
        .end(JSON.stringify({ message: { role: 'assistant', content: 'ok' }, prompt_eval_count: 12, eval_count: 3, done: true }));
    });
  });
  return new Promise(r => server.listen(0, '127.0.0.1', () =>
    r({ url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, server, bodies })));
}

const servers: Server[] = [];
after(() => servers.forEach(s => { s.closeAllConnections(); s.close(); }));

test('ollama is registered as an http adapter', () => {
  assert.equal(getAdapter('ollama').kind, 'http');
});

test('ollama call maps eval counts to tokens and sends a non-streaming chat', async () => {
  const f = await fake(); servers.push(f.server);
  const r = await ollamaAdapter(f.url).call('hi', 'qwen3-coder:30b', AbortSignal.timeout(5000));
  assert.deepEqual([r.text, r.tokensIn, r.tokensOut, r.rateLimited, r.error], ['ok', 12, 3, false, undefined]);
  const b = f.bodies[0] as { model: string; stream: boolean; messages: { content: string }[]; options: { num_ctx: number } };
  assert.equal(b.model, 'qwen3-coder:30b');
  assert.equal(b.stream, false);
  assert.equal(b.messages[0].content, 'hi');
  assert.equal(b.options.num_ctx, 8192);
});

test('ollama down → error names the url', async () => {
  const f = await fake(); const url = f.url; f.server.close();
  await new Promise(r => setTimeout(r, 50));
  const r = await ollamaAdapter(url).call('hi', 'qwen3-coder:30b', AbortSignal.timeout(5000));
  assert.ok(r.error!.startsWith(`Ollama not running at ${url}`), r.error);
  assert.equal(r.rateLimited, false);
});

test('unknown model (404) → error names the model and suggests ollama pull', async () => {
  const f = await fake(); servers.push(f.server);
  const r = await ollamaAdapter(f.url).call('hi', 'missing:1b', AbortSignal.timeout(5000));
  assert.match(r.error!, /missing:1b/);
  assert.match(r.error!, /ollama pull missing:1b/);
});

test('other http errors are reported with status, never as success', async () => {
  const f = await fake(); servers.push(f.server);
  const r = await ollamaAdapter(f.url).call('hi', 'busy', AbortSignal.timeout(5000));
  assert.match(r.error!, /503/);
  assert.equal(r.text, '');
});

test('abort signal cancels a hung request with a clear error', async () => {
  const f = await fake(); servers.push(f.server);
  const r = await ollamaAdapter(f.url).call('hi', 'slow', AbortSignal.timeout(200));
  assert.match(r.error!, /cancelled|timed out/i);
});

test('OLLAMA_HOST env sets the default base url', () => {
  const prev = process.env.OLLAMA_HOST;
  process.env.OLLAMA_HOST = 'http://10.0.0.5:11434';
  try { assert.equal(ollamaAdapter().baseUrl, 'http://10.0.0.5:11434'); }
  finally { if (prev === undefined) delete process.env.OLLAMA_HOST; else process.env.OLLAMA_HOST = prev; }
  assert.equal(ollamaAdapter('http://x:1/').baseUrl, 'http://x:1');
});

test('a prompt too large for num_ctx is refused instead of silently truncated', async () => {
  const r = await ollamaAdapter('http://127.0.0.1:9').call('x'.repeat(30000), 'qwen3-coder:30b', AbortSignal.timeout(2000));
  assert.match(r.error!, /too large/);
});

test('fetch timeouts and bad urls are named, not reported as "not running"', () => {
  assert.match(describeFetchError({ cause: { code: 'UND_ERR_HEADERS_TIMEOUT' } }, 'http://h:1'), /more than 300s/);
  assert.match(describeFetchError({ cause: { code: 'ECONNREFUSED' } }, 'http://h:1'), /not running at http:\/\/h:1 \(ECONNREFUSED\)/);
});

test('OLLAMA_HOST values without a scheme are normalised like the ollama CLI does', () => {
  assert.equal(normalizeHost('0.0.0.0'), 'http://localhost:11434');
  assert.equal(normalizeHost('127.0.0.1:11500'), 'http://127.0.0.1:11500');
  assert.equal(normalizeHost('https://box.lan/'), 'https://box.lan');
  assert.equal(normalizeHost('0.0.0.0:11434'), 'http://localhost:11434');
});

test('a 200 reply without message content is an error, not an empty success', async () => {
  const server = createServer((_q, res) => { res.writeHead(200, { 'content-type': 'application/json' }).end('{"done":true}'); });
  await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r())); servers.push(server);
  const r = await ollamaAdapter(`http://127.0.0.1:${(server.address() as AddressInfo).port}`).call('hi', 'm', AbortSignal.timeout(2000));
  assert.ok(r.error);
});
