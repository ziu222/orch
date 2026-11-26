import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpRoot } from './helpers.ts';
import { createTask, readRuns, taskDir } from '../src/store.ts';
import { defaultConfig } from '../src/config.ts';
import { runTask } from '../src/runner.ts';
import type { HttpAdapter, Task } from '../src/types.ts';

const FAKE = join(import.meta.dirname, 'fixtures', 'fake-cli.mjs');
const useFake = (mode: string) => { process.env.ORCH_BIN_CLAUDE = `"${process.execPath}" "${FAKE}" ${mode}`; };
afterEach(() => { delete process.env.ORCH_BIN_CLAUDE; });

function setup(over: Partial<Task> = {}) {
  const root = tmpRoot();
  const task = { ...createTask(root, { id: 'T-001', title: 't', role: 'scout', vendor: 'claude', deps: [], writesCode: false, ...over }, 'Find the mailer.', 'ctx: src/lib'), ...over };
  return { root, task, cfg: defaultConfig() };
}
const sig = (ms = 20000) => AbortSignal.timeout(ms);

test('ok: verified report → done, prompt and output.log written, start/end runs logged', async () => {
  useFake('ok');
  const { root, task, cfg } = setup();
  const o = await runTask(root, task, cfg, sig());
  assert.equal(o.status, 'done', o.reason);
  assert.equal(o.report?.verified, true);
  const prompt = readFileSync(join(taskDir(root, 'T-001'), 'prompt.md'), 'utf8');
  assert.match(prompt, /Find the mailer\./);
  assert.match(prompt, /ctx: src\/lib/);
  assert.ok(prompt.includes(taskDir(root, 'T-001')));
  assert.ok(existsSync(join(taskDir(root, 'T-001'), 'output.log')));
  const runs = readRuns(root);
  assert.deepEqual(runs.map(r => r.event), ['start', 'end · done']);
  assert.equal(runs[1].tokensIn, 100);
});

test('noreport: exit 0 without report.json → failed', async () => {
  useFake('noreport');
  const { root, task, cfg } = setup();
  const o = await runTask(root, task, cfg, sig());
  assert.equal(o.status, 'failed');
  assert.equal(o.reason, 'no valid report.json');
});

test('a stale report.json from an earlier run is not reused', async () => {
  useFake('noreport');
  const { root, task, cfg } = setup();
  writeFileSync(join(taskDir(root, 'T-001'), 'report.json'), JSON.stringify({ summary: 'old', files: [], verified: true, confidence: 'high' }));
  assert.equal((await runTask(root, task, cfg, sig())).status, 'failed');
});

test('unverified report → failed', async () => {
  useFake('unverified');
  const { root, task, cfg } = setup();
  const o = await runTask(root, task, cfg, sig());
  assert.equal(o.status, 'failed');
  assert.equal(o.reason, 'report not verified');
});

test('questions in the report → blocked', async () => {
  useFake('question');
  const { root, task, cfg } = setup();
  const o = await runTask(root, task, cfg, sig());
  assert.equal(o.status, 'blocked');
  assert.deepEqual(o.report?.questions, ['Which mailer?']);
});

test('rate limit → ratelimited', async () => {
  useFake('ratelimit');
  const { root, task, cfg } = setup();
  const o = await runTask(root, task, cfg, sig());
  assert.equal(o.status, 'ratelimited');
  assert.equal(o.result.rateLimited, true);
});

test('missing binary fails only this task with a clear reason', async () => {
  process.env.ORCH_BIN_CLAUDE = 'definitely-not-a-cli-xyz';
  const { root, task, cfg } = setup();
  const o = await runTask(root, task, cfg, sig());
  assert.equal(o.status, 'failed');
  assert.match(o.reason!, /not found or not logged in/);
});

test('hang is cancelled on abort and the child is gone', async () => {
  useFake('hang');
  const { root, task, cfg } = setup();
  const ac = new AbortController();
  setTimeout(() => ac.abort(), 1500);
  const o = await runTask(root, task, cfg, ac.signal);
  assert.equal(o.status, 'cancelled');
  const pid = Number(readFileSync(join(taskDir(root, 'T-001'), 'pid.txt'), 'utf8'));
  await new Promise(r => setTimeout(r, 300));
  assert.throws(() => process.kill(pid, 0), 'child process should be dead');
});

test('task timeout cancels the run', async () => {
  useFake('hang');
  const { root, task, cfg } = setup();
  cfg.taskTimeoutSec = 1.5;
  const o = await runTask(root, task, cfg, sig());
  assert.equal(o.status, 'cancelled');
  assert.match(o.reason!, /timed out/);
});

const fakeHttp = (text: string): HttpAdapter => ({ kind: 'http', call: async () => ({ text, tokensIn: 50, tokensOut: 9, rateLimited: false }) });

test('http adapter: JSON report in the reply is written to report.json → done', async () => {
  const { root, task, cfg } = setup({ vendor: 'ollama', role: 'summarize' });
  const reply = 'Here:\n```json\n{"summary":"short","files":[],"verified":true,"confidence":"med"}\n```';
  const o = await runTask(root, task, cfg, sig(), undefined, { getAdapter: () => fakeHttp(reply) });
  assert.equal(o.status, 'done', o.reason);
  assert.equal(JSON.parse(readFileSync(join(taskDir(root, 'T-001'), 'report.json'), 'utf8')).summary, 'short');
});

test('http adapter: reply without a report → failed', async () => {
  const { root, task, cfg } = setup({ vendor: 'ollama', role: 'summarize' });
  const o = await runTask(root, task, cfg, sig(), undefined, { getAdapter: () => fakeHttp('I summarised it.') });
  assert.equal(o.status, 'failed');
  assert.equal(o.reason, 'no valid report.json');
});

test('a code-writing task is never run on an http adapter', async () => {
  const { root, task, cfg } = setup({ vendor: 'ollama', role: 'implement', writesCode: true });
  const o = await runTask(root, task, cfg, sig(), undefined, { getAdapter: () => fakeHttp('{}') });
  assert.equal(o.status, 'failed');
  assert.match(o.reason!, /cannot write code/);
});

test('a background process left by the worker does not hang the run', async () => {
  useFake('orphan');
  const { root, task, cfg } = setup();
  const t0 = Date.now();
  const o = await runTask(root, task, cfg, sig(25000));
  try { process.kill(Number(readFileSync(join(taskDir(root, 'T-001'), 'orphan.txt'), 'utf8'))); } catch { /* gone */ }
  assert.equal(o.status, 'done', o.reason);
  assert.ok(Date.now() - t0 < 10000, `took ${Date.now() - t0}ms`);
});

test('http branch honours a signal that is already aborted', async () => {
  const { root, task, cfg } = setup({ vendor: 'ollama', role: 'summarize' });
  const ac = new AbortController(); ac.abort();
  const reply = '{"summary":"s","files":[],"verified":true,"confidence":"med"}';
  const o = await runTask(root, task, cfg, ac.signal, undefined, { getAdapter: () => fakeHttp(reply) });
  assert.equal(o.status, 'cancelled');
});

test('a missing working directory is reported as such, not as a missing CLI', async () => {
  useFake('ok');
  const { root, task, cfg } = setup();
  const o = await runTask(root, task, cfg, sig(), join(root, 'no-such-worktree'));
  assert.equal(o.status, 'failed');
  assert.match(o.reason!, /working directory/);
});

test('http prompt tells the model it cannot run commands and what verified means there', async () => {
  const { root, task, cfg } = setup({ vendor: 'ollama', role: 'summarize' });
  let sent = '';
  const spy: HttpAdapter = { kind: 'http', call: async (p) => { sent = p; return { text: '', tokensIn: 0, tokensOut: 0, rateLimited: false }; } };
  await runTask(root, task, cfg, sig(), undefined, { getAdapter: () => spy });
  assert.match(sent, /cannot run commands/);
});

test('multi-byte text split across chunks survives intact', async () => {
  useFake('unicode');
  const { root, task, cfg } = setup();
  const o = await runTask(root, task, cfg, sig());
  assert.equal(o.result.text, 'ệ'.repeat(40000));
});
