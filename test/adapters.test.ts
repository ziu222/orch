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
  assert.throws(() => getAdapter('grok' as never), /no adapter/);
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

const codex = getAdapter('codex') as SpawnAdapter;
const gemini = getAdapter('gemini') as SpawnAdapter;

test('codex parse takes the last agent message and turn usage', () => {
  const r = codex.parse(fx('codex-ok.jsonl'), '', 0);
  assert.equal(r.text, 'ok');
  assert.equal(r.tokensIn, 11834);
  assert.equal(r.tokensOut, 7);
  assert.equal(r.rateLimited, false);
  assert.equal(r.error, undefined);
});

test('codex parse reports the real expired-login run as an error, not a rate limit', () => {
  const r = codex.parse(fx('codex-auth-error.jsonl'), 'ERROR codex_login::auth::manager: Failed to refresh token: 401 Unauthorized', 1);
  assert.match(r.error!, /sign in again/);
  assert.equal(r.rateLimited, false);
});

test('codex parse flags usage limits and estimates reset from "try again in"', () => {
  const before = Date.now();
  const r = codex.parse(fx('codex-ratelimit.jsonl'), '', 1);
  assert.equal(r.rateLimited, true);
  const t = Date.parse(r.resetAt!);
  assert.ok(t >= before + (2 * 60 + 13) * 60_000 - 1000 && t <= Date.now() + (2 * 60 + 13) * 60_000 + 1000);
});

test('codex parse never throws on garbage and keeps a stdout snippet', () => {
  const r = codex.parse('not json\n{broken', '', 1);
  assert.ok(r.error);
  assert.equal(r.tokensIn, 0);
});

test('codex args: exec --json, no prompt text, optional model', () => {
  const a = codex.args('p.md', 'gpt-5.5-codex');
  assert.equal(codex.bin, 'codex');
  assert.deepEqual(a.slice(0, 2), ['exec', '--json']);
  assert.equal(a.at(-1), 'Read p.md and follow it.');
  assert.ok(a.join(' ').includes('-m gpt-5.5-codex'));
  assert.ok(a.includes('--skip-git-repo-check'));
});

test('gemini parse reads response and sums tokens across models', () => {
  const r = gemini.parse(fx('gemini-ok.json'), '', 0);
  assert.equal(r.text, 'ok');
  assert.equal(r.tokensIn, 8231);
  assert.equal(r.tokensOut, 2 + 57); // candidates + thoughts
  assert.equal(r.rateLimited, false);
});

test('gemini parse turns a 429 error object into a rate limit', () => {
  const r = gemini.parse(fx('gemini-error.json'), '', 1);
  assert.equal(r.rateLimited, true);
  assert.match(r.error!, /Quota exceeded/);
});

test('gemini parse never throws on odd output; stderr only matters on failure', () => {
  for (const out of ['null', '[]', 'oops']) assert.ok(gemini.parse(out, '', 1).error, out);
  assert.equal(gemini.parse(fx('gemini-ok.json'), 'quota warning', 0).rateLimited, false);
});

test('gemini args: -p with the instruction, json output, optional model', () => {
  const a = gemini.args('p.md', 'gemini-2.5-pro');
  assert.equal(gemini.bin, 'gemini');
  assert.deepEqual(a.slice(0, 2), ['-p', 'Read p.md and follow it.']);
  assert.ok(a.join(' ').includes('--output-format json'));
  assert.ok(a.join(' ').includes('-m gemini-2.5-pro'));
});

test('gemini parse survives null model entries', () => {
  assert.doesNotThrow(() => gemini.parse('{"response":"ok","stats":{"models":{"m":null}}}', '', 0));
});

test('gemini error object with an empty message is still an error', () => {
  const r = gemini.parse('{"error":{"message":"","code":500}}', '', 1);
  assert.ok(r.error);
  assert.ok(gemini.parse('{"error":{"code":500}}', '', 0).error);
});

test('codex retry notice before a completed turn is neither an error nor a rate limit', () => {
  const out = [
    '{"type":"turn.started"}',
    '{"type":"error","message":"Reconnecting... 1/5 (429 Too Many Requests)"}',
    '{"type":"item.completed","item":{"type":"agent_message","text":"ok"}}',
    '{"type":"turn.completed","usage":{"input_tokens":10,"output_tokens":1}}',
  ].join('\n');
  const r = codex.parse(out, '', 0);
  assert.equal(r.error, undefined);
  assert.equal(r.rateLimited, false);
  assert.equal(r.text, 'ok');
});
