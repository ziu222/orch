import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { listTasks, readTask } from './store.ts';

export const worktreePath = (repo: string, taskId: string) => join(repo, '.orch', 'worktrees', taskId);
export const branchName = (taskId: string) => `orch/${taskId.toLowerCase()}`;

function git(repo: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function branchExists(repo: string, branch: string): boolean {
  try {
    git(repo, 'rev-parse', '--verify', `refs/heads/${branch}`);
    return true;
  } catch {
    return false;
  }
}

// orch state and worktrees live in .orch/; keep them out of the user's git status without touching their .gitignore
export function excludeOrch(repo: string): void {
  const common = git(repo, 'rev-parse', '--git-common-dir');
  const file = join(isAbsolute(common) ? common : resolve(repo, common), 'info', 'exclude');
  const cur = existsSync(file) ? readFileSync(file, 'utf8') : '';
  if (cur.split(/\r?\n/).some(l => l.trim() === '.orch/' || l.trim() === '.orch' || l.trim() === '/.orch/')) return;
  mkdirSync(join(file, '..'), { recursive: true });
  appendFileSync(file, `${cur && !cur.endsWith('\n') ? '\n' : ''}.orch/\n`);
}

export function ensureWorktree(repo: string, taskId: string): string {
  const dir = worktreePath(repo, taskId);
  if (existsSync(dir)) return dir;
  excludeOrch(repo);
  mkdirSync(join(repo, '.orch', 'worktrees'), { recursive: true });
  const branch = branchName(taskId);
  if (branchExists(repo, branch)) git(repo, 'worktree', 'add', dir, branch);
  else git(repo, 'worktree', 'add', '-b', branch, dir, 'HEAD');
  return dir;
}

export function mergeWorktree(repo: string, taskId: string): { merged: boolean; message: string } {
  const task = readTask(repo, taskId);
  if (task.status !== 'done') {
    return { merged: false, message: `${taskId} is ${task.status}, not done` };
  }
  const tasks = listTasks(repo);
  const reviews = tasks
    .filter(t => t.role === 'review' && t.reviewOf === taskId)
    .sort((a, b) => (a.round ?? 1) - (b.round ?? 1) || a.id.localeCompare(b.id));
  const latestReview = reviews.at(-1);
  if (latestReview && latestReview.status !== 'done') {
    return { merged: false, message: `review ${latestReview.id} is ${latestReview.status}, not done` };
  }
  const watchIds = new Set([taskId, ...(latestReview ? [latestReview.id] : [])]);
  const pendingVerify = tasks.find(t => t.role === 'verify' && t.deps.some(d => watchIds.has(d)) && t.status !== 'done');
  if (pendingVerify) {
    return { merged: false, message: `verify ${pendingVerify.id} is ${pendingVerify.status}, not done` };
  }
  const branch = branchName(taskId);
  if (!branchExists(repo, branch)) {
    return { merged: false, message: `branch ${branch} does not exist` };
  }
  try {
    git(repo, 'merge', '--no-edit', branch);
    return { merged: true, message: `merged ${branch}` };
  } catch (e) {
    // never leave the user's checkout half-merged
    try { git(repo, 'merge', '--abort'); } catch { /* no merge in progress */ }
    return { merged: false, message: `could not merge ${branch} (conflict or local changes); merge aborted: ${(e as Error).message.split(/\r?\n/).slice(0, 3).join(' ')}` };
  }
}

// the worker never commits: orch does, so merge has something to merge. Returns false when nothing changed.
export function commitWorktree(dir: string, message: string): boolean {
  git(dir, 'add', '-A');
  if (git(dir, 'status', '--porcelain') === '') return false;
  let identity: string[] = [];
  try { git(dir, 'config', 'user.email'); } catch { identity = ['-c', 'user.name=orch', '-c', 'user.email=orch@localhost']; }
  git(dir, ...identity, 'commit', '-m', message);
  return true;
}

export function removeWorktree(repo: string, taskId: string): void {
  const dir = worktreePath(repo, taskId);
  if (!existsSync(dir)) return;
  git(repo, 'worktree', 'remove', '--force', dir);
}
