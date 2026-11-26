import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getAdapter, isRateLimit } from '../src/adapters/index.ts';
import type { SpawnAdapter } from '../src/types.ts';

const fx = (f: string) => readFileSync(join(import.meta.dirname, 'fixtures', f), 'utf8');
const claude = getAdapter('claude') as SpawnAdapter;

test('claude parse reads text and tokens from the real fixture', () => {
  const r = claude.parse(fx('claude-ok.json'), '', 0);
  assert.match(r.text, /ok/i);
  assert.equal(r.tokensIn, 2 + 49621); // input + cache creation + cache read
  assert.equal(r.tokensOut, 4);
  assert.equal(r.rateLimited, false);
  assert.equal(r.error, undefined);
});

test('claude parse flags rate limit from JSON result and from stderr', () => {
  const j = claude.parse(fx('claude-ratelimit.json'), '', 1);
  assert.equal(j.rateLimited, true);
  assert.equal(j.resetAt, new Date(1764172800 * 1000).toISOString());
  assert.equal(claude.parse('', fx('claude-ratelimit.txt'), 1).rateLimited, true);
});

test('claude args carry the prompt file path, never the prompt text', () => {
  const a = claude.args('.orch/tasks/T-001/prompt.md');
  assert.equal(claude.bin, 'claude');
  assert.equal(a[0], '-p');
  assert.equal(a[1], 'Read .orch/tasks/T-001/prompt.md and follow it.');
  assert.ok(a.includes('--output-format') && a[a.indexOf('--output-format') + 1] === 'json');
  assert.ok(claude.args('x', 'claude-opus-5-5').join(' ').includes('--model claude-opus-5-5'));
});

test('claude parse on non-JSON stdout returns an error instead of throwing', () => {
  const r = claude.parse('garbage', 'boom', 1);
  assert.match(r.error!, /boom|not JSON/);
  assert.equal(r.rateLimited, false);
});

test('claude parse surfaces is_error results as errors', () => {
  const r = claude.parse(JSON.stringify({ type: 'result', is_error: true, result: 'Invalid API key', usage: {} }), '', 1);
  assert.equal(r.error, 'Invalid API key');
});

test('isRateLimit matches the usual limit wordings only', () => {
  for (const s of ['rate limit exceeded', 'Usage limit reached', 'quota exhausted', 'HTTP 429', 'Too Many Requests']) assert.ok(isRateLimit(s), s);
  assert.equal(isRateLimit('all good, 4290 lines'), false);
});

test('unknown vendor has no adapter yet', () => {
  assert.throws(() => getAdapter('codex'), /no adapter/);
});
