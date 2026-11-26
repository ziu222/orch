import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpRoot } from './helpers.ts';
import { createTask, readTask, listTasks, readRuns, readQuestions, taskDir } from '../src/store.ts';
import { loadConfig, saveConfig, defaultConfig } from '../src/config.ts';
import { runEngine, validateDag } from '../src/engine.ts';
import { answerTask } from '../src/cli.ts';
import type { Report, Role, Task, Vendor } from '../src/types.ts';
import type { RunOutcome } from '../src/runner.ts';

const ok = (summary = 'done'): Report => ({ summary, files: [{ path: 'src/a.ts', lines: '1-9' }], verified: true, confidence: 'high' });
const res = { text: '', tokensIn: 1, tokensOut: 1, rateLimited: false };

function add(root: string, id: string, vendor: Vendor, deps: string[] = [], role: Role = 'scout', writesCode = false) {
  createTask(root, { id, title: id, role, vendor, deps, writesCode }, `do ${id}`);
}

// fake runner: outcome decided by a callback, records starts and concurrency
function fakeRun(decide: (t: Task) => Partial<RunOutcome> = () => ({}), ms = 30) {
  const starts: { id: string; vendor: Vendor }[] = [];
  let live = 0, peak = 0;
  const run = async (root: string, t: Task): Promise<RunOutcome> => {
    starts.push({ id: t.id, vendor: t.vendor });
    writeFileSync(join(taskDir(root, t.id), 'report.json'), JSON.stringify(ok(`${t.id} summary`)));
    peak = Math.max(peak, ++live);
    await new Promise(r => setTimeout(r, ms));
    live--;
    return { status: 'done', report: ok(`${t.id} summary`), result: res, ...decide(t) };
  };
  return { run, starts, peak: () => peak };
}

test('runs in dependency order', async () => {
  const root = tmpRoot();
  add(root, 'T-001', 'claude'); add(root, 'T-002', 'agy', ['T-001']); add(root, 'T-003', 'codex', ['T-002']);
  const f = fakeRun();
  const r = await runEngine(root, { run: f.run });
  assert.deepEqual(f.starts.map(s => s.id), ['T-001', 'T-002', 'T-003']);
  assert.equal(r.done, 3);
});

test('respects maxParallel per vendor', async () => {
  const root = tmpRoot();
  for (const id of ['T-001', 'T-002', 'T-003', 'T-004']) add(root, id, 'codex');
  const f = fakeRun();
  await runEngine(root, { run: f.run });
  assert.equal(f.peak(), 2);
  assert.ok(listTasks(root).every(t => t.status === 'done'));
});

test('cycle and unknown dep are rejected', async () => {
  assert.match(validateDag([{ id: 'T-1', deps: ['T-2'] }, { id: 'T-2', deps: ['T-1'] }])!, /cycle: T-1 → T-2 → T-1/);
  assert.match(validateDag([{ id: 'T-1', deps: ['T-9'] }])!, /T-1 depends on missing T-9/);
  assert.equal(validateDag([{ id: 'T-1', deps: [] }, { id: 'T-2', deps: ['T-1'] }]), null);
  const root = tmpRoot();
  add(root, 'T-001', 'claude', ['T-002']); add(root, 'T-002', 'claude', ['T-001']);
  await assert.rejects(runEngine(root, { run: fakeRun().run }), /cycle/);
});

test('rate limit pauses vendor and reroutes queued tasks to fallback', async () => {
  const root = tmpRoot();
  add(root, 'T-001', 'agy'); add(root, 'T-002', 'agy', ['T-001']); add(root, 'T-003', 'agy', ['T-001']);
  const now = () => new Date('2026-11-26T12:00:00Z');
  const f = fakeRun(t => (t.vendor === 'agy' ? { status: 'ratelimited', report: null, result: { ...res, rateLimited: true, resetAt: '2026-11-26T14:00:00.000Z' } } : {}));
  await runEngine(root, { run: f.run, now });
  assert.deepEqual(f.starts.filter(s => s.vendor === 'agy').map(s => s.id), ['T-001']);
  assert.ok(listTasks(root).every(t => t.status === 'done' && t.vendor === 'codex'));
  assert.equal(loadConfig(root).vendors.agy.pausedUntil, '2026-11-26T14:00:00.000Z');
  assert.ok(readRuns(root).some(e => e.vendor === 'agy' && e.event.startsWith('paused')));
});

test('a paused vendor with no usable fallback leaves the task queued and the engine exits', async () => {
  const root = tmpRoot();
  const cfg = defaultConfig(); cfg.vendors.codex.pausedUntil = '2026-11-26T15:00:00.000Z'; saveConfig(root, cfg);
  add(root, 'T-001', 'codex', [], 'verify'); // verify has no fallback
  const f = fakeRun();
  const r = await runEngine(root, { run: f.run, now: () => new Date('2026-11-26T12:00:00Z') });
  assert.equal(f.starts.length, 0);
  assert.equal(readTask(root, 'T-001').status, 'queued');
  assert.deepEqual(r.waiting, { codex: '2026-11-26T15:00:00.000Z' });
});

test('failed dependency blocks dependants, transitively', async () => {
  const root = tmpRoot();
  add(root, 'T-001', 'claude'); add(root, 'T-002', 'claude', ['T-001']); add(root, 'T-003', 'claude', ['T-002']);
  const f = fakeRun(t => (t.id === 'T-001' ? { status: 'failed', report: null, reason: 'boom' } : {}));
  const r = await runEngine(root, { run: f.run });
  assert.equal(readTask(root, 'T-001').status, 'failed');
  assert.equal(readTask(root, 'T-001').reason, 'boom');
  assert.equal(readTask(root, 'T-002').status, 'blocked');
  assert.equal(readTask(root, 'T-002').reason, 'dependency T-001 failed');
  assert.equal(readTask(root, 'T-003').status, 'blocked');
  assert.deepEqual([r.done, r.failed, r.blocked], [0, 1, 2]);
});

test('handoff appends each dependency summary and files to context.md', async () => {
  const root = tmpRoot();
  add(root, 'T-001', 'agy'); add(root, 'T-002', 'codex', ['T-001']);
  await runEngine(root, { run: fakeRun().run });
  const ctx = readFileSync(join(taskDir(root, 'T-002'), 'context.md'), 'utf8');
  assert.match(ctx, /T-001 summary/);
  assert.match(ctx, /src\/a\.ts:1-9/);
});

test('a code-writing task is never started on ollama', async () => {
  const root = tmpRoot();
  add(root, 'T-001', 'ollama', [], 'implement', true);
  const f = fakeRun();
  await runEngine(root, { run: f.run });
  assert.deepEqual(f.starts, [{ id: 'T-001', vendor: 'codex' }]);
});

test('abort stops new starts and running tasks end cancelled', async () => {
  const root = tmpRoot();
  add(root, 'T-001', 'claude'); add(root, 'T-002', 'claude', ['T-001']);
  const ac = new AbortController();
  const f = fakeRun(() => (ac.signal.aborted ? { status: 'cancelled', report: null } : {}), 200);
  setTimeout(() => ac.abort(), 50);
  await runEngine(root, { run: f.run, signal: ac.signal });
  assert.deepEqual(f.starts.map(s => s.id), ['T-001']);
  assert.equal(readTask(root, 'T-001').status, 'cancelled');
  assert.equal(readTask(root, 'T-002').status, 'queued');
});

test('blocked outcome (worker question) leaves the task blocked and records questions', async () => {
  const root = tmpRoot();
  add(root, 'T-001', 'agy');
  await runEngine(root, { run: fakeRun(() => ({ status: 'blocked', report: { ...ok(), questions: ['Which mailer?'] } })).run });
  assert.equal(readTask(root, 'T-001').status, 'blocked');
  assert.deepEqual(readQuestions(root, 'T-001'), [{ q: 'Which mailer?' }]);
  assert.ok(readRuns(root).some(e => e.task === 'T-001' && e.event === 'question'));
  answerTask(root, 'T-001', 'nodemailer');
  assert.equal(readTask(root, 'T-001').status, 'queued');
  assert.match(readFileSync(join(taskDir(root, 'T-001'), 'context.md'), 'utf8'), /Answer from user: nodemailer/);
});

test('a reset time in the past still pauses the vendor (no retry burst)', async () => {
  const root = tmpRoot();
  add(root, 'T-001', 'claude', [], 'plan'); // plan has no fallback
  const now = () => new Date('2026-11-26T12:00:00Z');
  const f = fakeRun(() => ({ status: 'ratelimited', report: null, result: { ...res, rateLimited: true, resetAt: '2026-11-26T10:00:00.000Z' } }), 5);
  await runEngine(root, { run: f.run, now });
  assert.equal(f.starts.length, 1);
  assert.equal(loadConfig(root).vendors.claude.pausedUntil, '2026-11-26T17:00:00.000Z');
});

test('a reroute never makes a vendor review its own code', async () => {
  const root = tmpRoot();
  const cfg = defaultConfig(); cfg.vendors.claude.pausedUntil = '2026-11-26T15:00:00.000Z'; saveConfig(root, cfg);
  add(root, 'T-001', 'codex', [], 'implement', true);
  createTask(root, { id: 'T-002', title: 'review', role: 'review', vendor: 'claude', deps: ['T-001'], writesCode: false, reviewOf: 'T-001' }, 'review');
  const f = fakeRun();
  await runEngine(root, { run: f.run, now: () => new Date('2026-11-26T12:00:00Z') });
  assert.deepEqual(f.starts.map(s => s.id), ['T-001']);
  assert.equal(readTask(root, 'T-002').status, 'queued');
});

test('an error while recording an outcome fails that task without stranding the others', async () => {
  const root = tmpRoot();
  add(root, 'T-001', 'claude'); add(root, 'T-002', 'codex');
  const poison = new Proxy({}, { get: () => { throw new Error('disk said no'); } }) as RunOutcome;
  const f = fakeRun(() => ({}), 20);
  const run = async (r: string, t: Task, ...rest: unknown[]) => (t.id === 'T-001' ? poison : f.run(r, t));
  await runEngine(root, { run: run as never });
  assert.equal(readTask(root, 'T-001').status, 'failed');
  assert.match(readTask(root, 'T-001').reason!, /disk said no/);
  assert.equal(readTask(root, 'T-002').status, 'done');
});

test('a finished task does not keep an old reason', async () => {
  const root = tmpRoot();
  add(root, 'T-001', 'agy');
  const f = fakeRun(t => (t.vendor === 'agy' ? { status: 'ratelimited', report: null, result: { ...res, rateLimited: true } } : {}), 5);
  await runEngine(root, { run: f.run });
  const t = readTask(root, 'T-001');
  assert.equal(t.status, 'done');
  assert.equal(t.reason, undefined);
});

test('review findings spawn fix + re-review, capped at maxReviewRounds', async () => {
  const root = tmpRoot();
  add(root, 'T-001', 'codex', [], 'implement', true);
  createTask(root, { id: 'T-002', title: 'Review T-001', role: 'review', vendor: 'claude', deps: ['T-001'], writesCode: false, reviewOf: 'T-001', round: 1 }, 'review');
  const f = fakeRun(t => (t.role === 'review' ? { status: 'done', report: { ...ok(), findings: ['missing null check'] } } : {}), 5);
  await runEngine(root, { run: f.run });
  const all = listTasks(root);
  const reviews = all.filter(t => t.role === 'review');
  const fixes = all.filter(t => t.role === 'implement' && t.id !== 'T-001');
  assert.equal(reviews.length, 2);
  assert.equal(fixes.length, 1);
  assert.equal(fixes[0].vendor, 'codex');
  assert.equal(reviews[1].vendor, 'claude');
  assert.equal(reviews[1].status, 'blocked');
  assert.match(readQuestions(root, reviews[1].id)[0].q, /after 2 rounds/);
});

test('same-vendor review is refused at task creation', () => {
  const root = tmpRoot();
  add(root, 'T-001', 'codex', [], 'implement', true);
  assert.throws(
    () => createTask(root, { id: 'T-002', title: 'bad review', role: 'review', vendor: 'codex', deps: ['T-001'], writesCode: false, reviewOf: 'T-001' }, 'review'),
    /cross-vendor review required/,
  );
});
