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

import { commitWorktree } from '../src/worktree.ts';

// a user repo that does NOT ignore .orch/ itself
function plainRepo(): string {
  const repo = tmpRoot();
  git(repo, 'init');
  git(repo, 'config', 'user.email', 'test@example.com');
  git(repo, 'config', 'user.name', 'Test User');
  writeFileSync(join(repo, 'README.md'), 'hello\n');
  git(repo, 'add', 'README.md');
  git(repo, 'commit', '-m', 'init');
  return repo;
}

test('commitWorktree commits what the worker left uncommitted, and reports when there is nothing', () => {
  const repo = initGitRepo();
  const wt = ensureWorktree(repo, 'T-001');
  assert.equal(commitWorktree(wt, 'feat(T-001): add feature'), false);
  writeFileSync(join(wt, 'feature.txt'), 'x\n');
  assert.equal(commitWorktree(wt, 'feat(T-001): add feature'), true);
  assert.equal(git(wt, 'status', '--porcelain'), '');
  assert.equal(git(repo, 'log', '-1', '--format=%s', 'orch/t-001'), 'feat(T-001): add feature');
});

test('commitWorktree works even when git has no identity configured', () => {
  const repo = initGitRepo();
  const wt = ensureWorktree(repo, 'T-001');
  writeFileSync(join(wt, 'f.txt'), 'x\n');
  git(repo, 'config', '--unset', 'user.email'); git(repo, 'config', '--unset', 'user.name');
  const keys = ['GIT_CONFIG_GLOBAL', 'GIT_CONFIG_SYSTEM'] as const;
  const prev = keys.map(k => process.env[k]);
  keys.forEach(k => { process.env[k] = join(repo, 'none'); });
  try { assert.equal(commitWorktree(wt, 'feat(T-001): x'), true); }
  finally { keys.forEach((k, i) => { if (prev[i] === undefined) delete process.env[k]; else process.env[k] = prev[i]; }); }
});

test('ensureWorktree keeps .orch/ out of the main checkout even when the repo does not ignore it', () => {
  const repo = plainRepo();
  ensureWorktree(repo, 'T-001');
  assert.equal(git(repo, 'status', '--porcelain'), '');
});

test('a conflicting merge is aborted so the repo is not left mid-merge', () => {
  const repo = plainRepo();
  createTask(repo, { id: 'T-001', title: 'impl', role: 'implement', vendor: 'codex', deps: [], writesCode: true }, 'impl');
  const wt = ensureWorktree(repo, 'T-001');
  writeFileSync(join(wt, 'README.md'), 'from branch\n');
  commitWorktree(wt, 'feat(T-001): edit');
  setStatus(repo, 'T-001', 'done', { worktree: wt });
  writeFileSync(join(repo, 'README.md'), 'from main\n');
  git(repo, 'commit', '-am', 'edit on main');
  const r = mergeWorktree(repo, 'T-001');
  assert.equal(r.merged, false);
  assert.match(r.message, /conflict/i);
  assert.equal(existsSync(join(repo, '.git', 'MERGE_HEAD')), false);
  assert.equal(readFileSync(join(repo, 'README.md'), 'utf8').trim(), 'from main');
});
