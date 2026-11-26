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
  const soon = Math.floor(Date.now() / 1000) + 3600;
  const withReset = claude.parse(JSON.stringify({ type: 'result', is_error: true, api_error_status: 429, result: `Claude AI usage limit reached|${soon}`, usage: {} }), '', 1);
  assert.equal(withReset.resetAt, new Date(soon * 1000).toISOString());
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

test('claude parse never throws and reports an error for JSON that is not a result object', () => {
  for (const out of ['null', '[]', '"x"', '{"type":"assistant"}']) {
    const r = claude.parse(out, '', 1);
    assert.ok(r.error, out);
    assert.equal(r.tokensIn, 0);
  }
});

test('stderr noise on a successful run is not a rate limit', () => {
  const r = claude.parse(fx('claude-ok.json'), 'Warning: approaching usage limit, quota 80%', 0);
  assert.equal(r.rateLimited, false);
  assert.equal(r.error, undefined);
});

test('current limit wordings in the JSON result count as rate limits', () => {
  for (const msg of ["You've hit your limit · resets 8pm", '5-hour limit reached · resets 9:40pm']) {
    const r = claude.parse(JSON.stringify({ type: 'result', is_error: true, api_error_status: null, result: msg, usage: {} }), '', 1);
    assert.equal(r.rateLimited, true, msg);
  }
});

test('resetAt is only taken from rate-limited results and must be a sane date', () => {
  const ok = JSON.stringify({ type: 'result', is_error: false, result: 'done|99999999999999999', usage: {} });
  assert.doesNotThrow(() => claude.parse(ok, '', 0));
  assert.equal(claude.parse(ok, '', 0).resetAt, undefined);
  const far = JSON.stringify({ type: 'result', is_error: true, api_error_status: 429, result: 'usage limit reached|1764172800000', usage: {} });
  assert.equal(claude.parse(far, '', 1).resetAt, undefined);
});
