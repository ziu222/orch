import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpRoot } from './helpers.ts';
import { createTask, setStatus } from '../src/store.ts';
import { ensureWorktree, mergeWorktree, removeWorktree } from '../src/worktree.ts';

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function initGitRepo(): string {
  const repo = tmpRoot();
  git(repo, 'init');
  git(repo, 'config', 'user.email', 'test@example.com');
  git(repo, 'config', 'user.name', 'Test User');
  writeFileSync(join(repo, '.gitignore'), '.env\n.orch/\n');
  writeFileSync(join(repo, '.env'), 'SECRET=123\n');
  writeFileSync(join(repo, 'README.md'), 'hello\n');
  git(repo, 'add', '.gitignore', 'README.md');
  git(repo, 'commit', '-m', 'init');
  return repo;
}

test('ensureWorktree isolates changes and does not copy .env', () => {
  const repo = initGitRepo();
  const wt = ensureWorktree(repo, 'T-001');
  assert.ok(existsSync(wt));
  assert.equal(git(wt, 'branch', '--show-current'), 'orch/t-001');
  assert.equal(existsSync(join(wt, '.env')), false);

  writeFileSync(join(wt, 'feature.txt'), 'from worktree\n');
  git(wt, 'add', 'feature.txt');
  git(wt, 'commit', '-m', 'add feature');
  assert.equal(existsSync(join(repo, 'feature.txt')), false);

  // calling again reuses the existing worktree
  assert.equal(ensureWorktree(repo, 'T-001'), wt);
  removeWorktree(repo, 'T-001');
  assert.equal(existsSync(wt), false);
});

test('mergeWorktree refuses until review is done, then merges cleanly', () => {
  const repo = initGitRepo();
  createTask(repo, { id: 'T-001', title: 'impl', role: 'implement', vendor: 'codex', deps: [], writesCode: true }, 'impl');
  createTask(repo, { id: 'T-002', title: 'review', role: 'review', vendor: 'claude', deps: ['T-001'], writesCode: false, reviewOf: 'T-001', round: 1 }, 'review');
  const wt = ensureWorktree(repo, 'T-001');
  writeFileSync(join(wt, 'health.ts'), 'export const ok = true;\n');
  git(wt, 'add', 'health.ts');
  git(wt, 'commit', '-m', 'add health');

  setStatus(repo, 'T-001', 'done', { worktree: wt });
  const blocked = mergeWorktree(repo, 'T-001');
  assert.equal(blocked.merged, false);
  assert.match(blocked.message, /review T-002 is queued/);

  setStatus(repo, 'T-002', 'done');
  const ok = mergeWorktree(repo, 'T-001');
  assert.equal(ok.merged, true, ok.message);
  assert.equal(readFileSync(join(repo, 'health.ts'), 'utf8').trim(), 'export const ok = true;');
});
