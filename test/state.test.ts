import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpRoot } from './helpers.ts';
import { appendQuestion, appendRun, createTask, setStatus, taskDir } from '../src/store.ts';
import { defaultConfig, saveConfig } from '../src/config.ts';
import { buildState, readDiff } from '../src/state.ts';
import { ensureWorktree, commitWorktree } from '../src/worktree.ts';

const NOW = Date.parse('2026-11-27T12:00:00Z');
const iso = (minAgo: number) => new Date(NOW - minAgo * 60_000).toISOString();
const git = (cwd: string, ...a: string[]) => execFileSync('git', a, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

function run(root: string, task: string, vendor: 'claude' | 'codex' | 'ollama', event: string, tin: number, tout: number, minAgo: number) {
  // appendRun stamps "now"; write the line ourselves so tests control time
  const line = JSON.stringify({ ts: iso(minAgo), task, vendor, event, tokensIn: tin, tokensOut: tout });
  mkdirSync(join(root, '.orch'), { recursive: true });
  writeFileSync(join(root, '.orch', 'runs.jsonl'), line + '\n', { flag: 'a' });
}

function seed() {
  const root = tmpRoot();
  createTask(root, { id: 'T-001', title: 'Scout auth', role: 'scout', vendor: 'claude', deps: [], writesCode: false }, 'x');
  createTask(root, { id: 'T-002', title: 'Write reset', role: 'implement', vendor: 'codex', deps: ['T-001'], writesCode: false }, 'y');
  createTask(root, { id: 'T-003', title: 'Summarise', role: 'summarize', vendor: 'ollama', deps: [], writesCode: false }, 'z');
  setStatus(root, 'T-001', 'done');
  setStatus(root, 'T-003', 'blocked');
  appendQuestion(root, 'T-003', 'Which mailer?');
  writeFileSync(join(taskDir(root, 'T-001'), 'report.json'), JSON.stringify({ summary: 'found it', files: [{ path: 'src/auth/login.ts', lines: '12-88' }], verified: true, confidence: 'high' }));
  run(root, 'T-001', 'claude', 'start', 0, 0, 200);
  run(root, 'T-001', 'claude', 'end · done', 1000, 200, 198);
  run(root, 'T-002', 'codex', 'start', 0, 0, 10);
  run(root, 'T-002', 'codex', 'end · done', 500, 100, 8);
  run(root, 'T-001', 'claude', 'end · done', 2000, 300, 2000); // older than a day: counts for nothing in 5h, total only
  return root;
}

test('vendors carry queue, rolling token windows and a 20-bucket history', () => {
  const root = seed();
  const s = buildState(root, NOW);
  const claude = s.vendors.find(v => v.id === 'claude')!;
  assert.equal(claude.tokens5h, 1200);
  assert.equal(claude.tokensTotal, 1200 + 2300);
  assert.equal(claude.hist.length, 20);
  assert.equal(claude.hist.reduce((a, b) => a + b, 0), 1200);
  const codex = s.vendors.find(v => v.id === 'codex')!;
  assert.deepEqual(codex.waiting, [{ id: 'T-002', why: 'đang xếp hàng' }]);
  assert.ok(s.vendors.some(v => v.id === 'ollama' && v.local));
  assert.deepEqual(s.vendors.map(v => v.id), ['claude', 'codex', 'agy', 'copilot', 'ollama']);
});

test('percentages appear only when a budget is configured', () => {
  const root = seed();
  assert.equal(buildState(root, NOW).vendors.find(v => v.id === 'claude')!.pct5h, undefined);
  const cfg = defaultConfig(); cfg.vendors.claude.budget5h = 12000; saveConfig(root, cfg);
  assert.equal(buildState(root, NOW).vendors.find(v => v.id === 'claude')!.pct5h, 10);
});

test('tasks carry tokens, duration, report and open question; questions are listed', () => {
  const root = seed();
  const s = buildState(root, NOW);
  const t1 = s.tasks.find(t => t.id === 'T-001')!;
  assert.deepEqual([t1.tokensIn, t1.tokensOut], [1000 + 2000, 200 + 300]);
  assert.equal(t1.report?.summary, 'found it');
  assert.equal(t1.verified, true);
  const t3 = s.tasks.find(t => t.id === 'T-003')!;
  assert.equal(t3.question, 'Which mailer?');
  assert.deepEqual(s.questions, [{ task: 'T-003', q: 'Which mailer?' }]);
});

test('runs are the newest 200 events, oldest first', () => {
  const root = seed();
  const s = buildState(root, NOW);
  assert.equal(s.runs.length, 5);
  assert.ok(Date.parse(s.runs[0].ts) <= Date.parse(s.runs.at(-1)!.ts));
});

test('agentsMd is read from the repo root, empty when absent', () => {
  const root = seed();
  assert.equal(buildState(root, NOW).agentsMd, '');
  writeFileSync(join(root, 'AGENTS.md'), '# rules');
  assert.equal(buildState(root, NOW).agentsMd, '# rules');
});

test('files come from reports when there is no git, marked read-only', () => {
  const root = seed();
  const f = buildState(root, NOW).files.find(x => x.path === 'src/auth/login.ts')!;
  assert.equal(f.status, 'R');
  assert.deepEqual(f.by.map(b => b.task), ['T-001']);
});

test('files and diffs come from the task worktree when the repo is git', () => {
  const root = tmpRoot();
  git(root, 'init'); git(root, 'config', 'user.email', 't@t'); git(root, 'config', 'user.name', 't');
  writeFileSync(join(root, 'README.md'), 'one\n'); git(root, 'add', 'README.md'); git(root, 'commit', '-m', 'init');
  createTask(root, { id: 'T-001', title: 'edit', role: 'implement', vendor: 'codex', deps: [], writesCode: true }, 'x');
  const wt = ensureWorktree(root, 'T-001');
  writeFileSync(join(wt, 'README.md'), 'one\ntwo\n');
  writeFileSync(join(wt, 'new.ts'), 'export {}\n');
  commitWorktree(wt, 'feat(T-001): edit');
  setStatus(root, 'T-001', 'done', { worktree: wt });
  const files = buildState(root, NOW).files;
  const status = (p: string) => files.find(f => f.path === p)?.status;
  assert.equal(status('README.md'), 'M');
  assert.equal(status('new.ts'), 'A');
  assert.deepEqual(files.find(f => f.path === 'new.ts')!.by.map(b => b.task), ['T-001']);
  const diff = readDiff(root, 'T-001', 'README.md');
  assert.match(diff, /\+two/);
});

test('readDiff refuses paths outside the repo and unknown tasks', () => {
  const root = seed();
  assert.throws(() => readDiff(root, 'T-001', '../../etc/passwd'), /path/);
  assert.throws(() => readDiff(root, 'T-099', 'a.ts'), /task/);
});
