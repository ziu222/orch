import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpRoot } from './helpers.ts';
import {
  createTask, readTask, listTasks, setStatus, nextTaskId, taskDir, readReport,
  appendContext, appendRun, readRuns, appendQuestion, answerQuestion, readQuestions,
} from '../src/store.ts';
import { readFileSync } from 'node:fs';

const scout = (id: string) => ({ id, title: 'Scout auth', role: 'scout' as const, vendor: 'gemini' as const, deps: [], writesCode: false });

test('createTask writes queued task and ids increment', () => {
  const root = tmpRoot();
  const id = nextTaskId(root);
  assert.equal(id, 'T-001');
  createTask(root, scout(id), '# do it');
  assert.equal(readTask(root, id).status, 'queued');
  assert.equal(readFileSync(join(taskDir(root, id), 'task.md'), 'utf8'), '# do it');
  assert.equal(nextTaskId(root), 'T-002');
});

test('listTasks is sorted by id and setStatus merges extra fields', () => {
  const root = tmpRoot();
  createTask(root, scout('T-002'), 'b');
  createTask(root, scout('T-001'), 'a');
  assert.deepEqual(listTasks(root).map(t => t.id), ['T-001', 'T-002']);
  const t = setStatus(root, 'T-001', 'running', { worktree: '/w' });
  assert.equal(t.status, 'running');
  assert.equal(readTask(root, 'T-001').worktree, '/w');
});

test('readReport returns null for missing or broken report.json', () => {
  const root = tmpRoot();
  createTask(root, scout('T-001'), 'x');
  assert.equal(readReport(root, 'T-001'), null);
  writeFileSync(join(taskDir(root, 'T-001'), 'report.json'), '{oops');
  assert.equal(readReport(root, 'T-001'), null);
  writeFileSync(join(taskDir(root, 'T-001'), 'report.json'), JSON.stringify({ summary: 's', files: [], verified: true, confidence: 'high' }));
  assert.equal(readReport(root, 'T-001')?.verified, true);
});

test('appendContext adds to context.md', () => {
  const root = tmpRoot();
  createTask(root, scout('T-001'), 'x', 'start');
  appendContext(root, 'T-001', 'Answer from user: vi');
  assert.match(readFileSync(join(taskDir(root, 'T-001'), 'context.md'), 'utf8'), /start[\s\S]*Answer from user: vi/);
});

test('runs.jsonl appends and reads back in order', () => {
  const root = tmpRoot();
  appendRun(root, { task: 'T-001', vendor: 'claude', event: 'start', tokensIn: 0, tokensOut: 0 });
  appendRun(root, { task: 'T-001', vendor: 'claude', event: 'end', tokensIn: 10, tokensOut: 2 });
  const runs = readRuns(root);
  assert.deepEqual(runs.map(r => r.event), ['start', 'end']);
  assert.ok(!Number.isNaN(Date.parse(runs[0].ts)));
  assert.deepEqual(readRuns(tmpRoot()), []);
});

test('questions round-trip', () => {
  const root = tmpRoot();
  createTask(root, scout('T-001'), 'x');
  appendQuestion(root, 'T-001', 'Which mailer?');
  assert.deepEqual(readQuestions(root, 'T-001'), [{ q: 'Which mailer?' }]);
  answerQuestion(root, 'T-001', 'nodemailer');
  assert.deepEqual(readQuestions(root, 'T-001'), [{ q: 'Which mailer?', a: 'nodemailer' }]);
});
