import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpRoot } from './helpers.ts';
import { appendQuestion, appendRun, createTask, readTask, setStatus, taskDir } from '../src/store.ts';
import { defaultConfig, saveConfig } from '../src/config.ts';

const CLI = join(import.meta.dirname, '..', 'src', 'cli.ts');
const orch = (cwd: string, ...args: string[]) => spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8' });

test('orch init creates .orch/config.json with defaults and AGENTS.md', () => {
  const root = tmpRoot();
  const r = orch(root, 'init');
  assert.equal(r.status, 0, r.stderr);
  const cfg = JSON.parse(readFileSync(join(root, '.orch', 'config.json'), 'utf8'));
  assert.equal(cfg.vendors.ollama.maxParallel, 1);
  assert.match(readFileSync(join(root, 'AGENTS.md'), 'utf8'), /report\.json/);
});

test('orch init keeps an existing AGENTS.md and config', () => {
  const root = tmpRoot();
  orch(root, 'init');
  writeFileSync(join(root, 'AGENTS.md'), 'mine');
  writeFileSync(join(root, '.orch', 'config.json'), JSON.stringify({ maxReviewRounds: 3 }));
  assert.equal(orch(root, 'init').status, 0);
  assert.equal(readFileSync(join(root, 'AGENTS.md'), 'utf8'), 'mine');
  assert.equal(JSON.parse(readFileSync(join(root, '.orch', 'config.json'), 'utf8')).maxReviewRounds, 3);
});

test('unknown command prints usage and exits 1', () => {
  const root = tmpRoot();
  const r = orch(root, 'frobnicate');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /usage: orch/);
  assert.equal(existsSync(join(root, '.orch')), false);
});

test('worker prompt template carries the report contract placeholders', () => {
  const t = readFileSync(join(import.meta.dirname, '..', 'templates', 'worker-prompt.md'), 'utf8');
  for (const s of ['{{taskDir}}', '{{id}}', '"verified"', '"questions"']) assert.ok(t.includes(s), s);
});

test('AGENTS.md template forbids secrets but not the task folder', () => {
  const t = readFileSync(join(import.meta.dirname, '..', 'templates', 'AGENTS.md'), 'utf8');
  assert.doesNotMatch(t, /listed in `\.gitignore`/);
  assert.match(t, /\.env/);
});

test('orch status and answer show open questions and requeue on answer', () => {
  const root = tmpRoot();
  createTask(root, { id: 'T-001', title: 'Scout mail', role: 'scout', vendor: 'agy', deps: [], writesCode: false }, 'scout');
  appendQuestion(root, 'T-001', 'Which mailer?');
  setStatus(root, 'T-001', 'blocked');

  const st = orch(root, 'status');
  assert.equal(st.status, 0, st.stderr);
  assert.match(st.stdout, /T-001\s+blocked\s+agy\s+Scout mail/);
  assert.match(st.stdout, /\? Which mailer\?/);

  const ans = orch(root, 'answer', 'T-001', 'nodemailer');
  assert.equal(ans.status, 0, ans.stderr);
  assert.equal(readTask(root, 'T-001').status, 'queued');
  assert.match(readFileSync(join(taskDir(root, 'T-001'), 'context.md'), 'utf8'), /Answer from user: nodemailer/);
});

test('orch stats sums tokens per vendor, marks estimated and shows pausedUntil', () => {
  const root = tmpRoot();
  const cfg = defaultConfig();
  cfg.vendors.claude.pausedUntil = '2099-01-01T00:00:00.000Z';
  saveConfig(root, cfg);
  createTask(root, { id: 'T-001', title: 'x', role: 'scout', vendor: 'copilot', deps: [], writesCode: false }, 'x');
  appendRun(root, { task: 'T-001', vendor: 'copilot', event: 'end · done', tokensIn: 0, tokensOut: 0, estimated: true });
  appendRun(root, { task: 'T-002', vendor: 'claude', event: 'end · done', tokensIn: 1200, tokensOut: 300 });

  const r = orch(root, 'stats');
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /copilot.*\(estimated\)/);
  assert.match(r.stdout, /claude.*in=1200.*out=300.*paused until 2099-01-01T00:00:00\.000Z/);
});

test('worker prompt says how to verify when the project has no tests', () => {
  const t = readFileSync(join(import.meta.dirname, '..', 'templates', 'worker-prompt.md'), 'utf8');
  assert.match(t, /project has none/);
  assert.doesNotMatch(t, /Follow AGENTS\.md at the repository root/);
});
