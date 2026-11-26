import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { isAbsolute, join, normalize } from 'node:path';
import { loadConfig } from './config.ts';
import { listTasks, readQuestions, readReport, readRuns, readTask } from './store.ts';
import { branchName } from './worktree.ts';
import type { RunEvent, Task, Vendor } from './types.ts';
import type { ChatMsg, UiFile, UiSkill, UiState, UiTask, UiVendor } from './ui-types.ts';

const VENDORS: { id: Vendor; name: string; code: string; local?: boolean }[] = [
  { id: 'claude', name: 'Claude Code', code: 'CL' },
  { id: 'codex', name: 'Codex CLI', code: 'CX' },
  { id: 'agy', name: 'Antigravity', code: 'AG' },
  { id: 'copilot', name: 'Copilot CLI', code: 'CP' },
  { id: 'ollama', name: 'Ollama', code: 'OL', local: true },
];
const BUCKET_MS = 15 * 60_000;
const BUCKETS = 20; // 5 hours
const WEEK_MS = 7 * 24 * 3600_000;

const git = (cwd: string, ...a: string[]): string =>
  execFileSync('git', a, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 16 * 1024 * 1024 }).trim();
const tryGit = (cwd: string, ...a: string[]): string => { try { return git(cwd, ...a); } catch { return ''; } };
const readText = (p: string): string => { try { return readFileSync(p, 'utf8'); } catch { return ''; } };

const tokensOf = (r: RunEvent) => (r.event.startsWith('end') ? r.tokensIn + r.tokensOut : 0);

function waitWhy(t: Task, byId: Map<string, Task>, paused: boolean): string {
  if (t.status === 'blocked') return 'câu hỏi';
  const dep = t.deps.find(d => byId.get(d)?.status !== 'done');
  if (dep) return `chờ ${dep}`;
  return paused ? 'quota' : 'đang xếp hàng';
}

function buildVendors(root: string, tasks: Task[], runs: RunEvent[], now: number): UiVendor[] {
  const cfg = loadConfig(root);
  const byId = new Map(tasks.map(t => [t.id, t]));
  return VENDORS.map(({ id, name, code, local }) => {
    const c = cfg.vendors[id];
    const mine = runs.filter(r => r.vendor === id);
    const sum = (from: number) => mine.filter(r => Date.parse(r.ts) >= from).reduce((s, r) => s + tokensOf(r), 0);
    const hist = new Array<number>(BUCKETS).fill(0);
    for (const r of mine) {
      const age = now - Date.parse(r.ts);
      if (age < 0 || age >= BUCKETS * BUCKET_MS) continue;
      hist[BUCKETS - 1 - Math.floor(age / BUCKET_MS)] += tokensOf(r);
    }
    const tokens5h = sum(now - BUCKETS * BUCKET_MS);
    const tokensWeek = sum(now - WEEK_MS);
    const paused = !!c.pausedUntil && Date.parse(c.pausedUntil) > now;
    const pct = (used: number, budget?: number) => (budget ? Math.round((used / budget) * 100) : undefined);
    const p5 = pct(tokens5h, c.budget5h), pw = pct(tokensWeek, c.budgetWeek);
    return {
      id, name, code, local: !!local,
      ...(c.model ? { model: c.model } : {}),
      maxParallel: c.maxParallel,
      running: tasks.filter(t => t.vendor === id && t.status === 'running').map(t => t.id),
      waiting: tasks.filter(t => t.vendor === id && (t.status === 'queued' || t.status === 'blocked')).map(t => ({ id: t.id, why: waitWhy(t, byId, paused) })),
      ...(paused ? { pausedUntil: c.pausedUntil } : {}),
      tokens5h, tokensWeek, tokensTotal: mine.reduce((s, r) => s + tokensOf(r), 0),
      hist,
      ...(p5 !== undefined ? { pct5h: p5 } : {}),
      ...(pw !== undefined ? { pctWeek: pw } : {}),
    };
  });
}

function buildTasks(root: string, tasks: Task[], runs: RunEvent[], now: number): UiTask[] {
  return tasks.map(t => {
    let tokensIn = 0, tokensOut = 0, secs = 0, started: number | null = null;
    for (const r of runs) {
      if (r.task !== t.id) continue;
      const ts = Date.parse(r.ts);
      if (r.event === 'start') started = ts;
      else if (r.event.startsWith('end')) {
        tokensIn += r.tokensIn; tokensOut += r.tokensOut;
        if (started !== null) secs += Math.max(0, (ts - started) / 1000);
        started = null;
      }
    }
    if (t.status === 'running' && started !== null) secs += Math.max(0, (now - started) / 1000);
    const report = readReport(root, t.id);
    const open = readQuestions(root, t.id).find(q => q.a == null);
    return {
      id: t.id, title: t.title, role: t.role, vendor: t.vendor, status: t.status, deps: t.deps, writesCode: t.writesCode,
      ...(t.reviewOf ? { reviewOf: t.reviewOf } : {}), ...(t.round ? { round: t.round } : {}),
      ...(t.worktree ? { worktree: t.worktree } : {}), ...(t.reason ? { reason: t.reason } : {}),
      tokensIn, tokensOut, secs: Math.round(secs),
      ...(report ? { verified: report.verified } : {}),
      report,
      ...(open ? { question: open.q } : {}),
    };
  });
}

const RANK: Record<UiFile['status'], number> = { A: 3, M: 2, R: 1, '': 0 };
const norm = (p: string) => p.replace(/\\/g, '/').replace(/^\.\//, '');

function collectFiles(root: string, tasks: Task[]): UiFile[] {
  const files = new Map<string, UiFile>();
  const touch = (path: string, status: UiFile['status'], by?: UiFile['by'][number]) => {
    const key = norm(path);
    const f = files.get(key) ?? { path: key, status: '', by: [] };
    if (RANK[status] > RANK[f.status]) f.status = status;
    if (by) f.by.push(by);
    files.set(key, f);
  };
  const isGit = existsSync(join(root, '.git'));
  if (isGit) for (const p of tryGit(root, 'ls-files').split('\n').filter(Boolean).slice(0, 3000)) touch(p, '');

  for (const t of tasks) {
    const rep = readReport(root, t.id);
    for (const f of rep?.files ?? []) {
      touch(f.path, 'R', { task: t.id, vendor: t.vendor, act: f.lines ? `đọc dòng ${f.lines}` : 'đọc' });
    }
    if (!isGit || !t.writesCode || !t.worktree || !existsSync(t.worktree)) continue;
    const branch = t.worktree.endsWith(t.id) ? branchName(t.id) : '';
    const base = branch ? tryGit(root, 'merge-base', 'HEAD', branch) : '';
    const numstat = new Map<string, string>();
    const names = new Map<string, 'A' | 'M'>();
    if (base) {
      for (const l of tryGit(root, 'diff', '--numstat', base, branch).split('\n').filter(Boolean)) {
        const [a, d, p] = l.split('\t');
        numstat.set(norm(p), `+${a}${Number(d) ? ` −${d}` : ''}`);
      }
      for (const l of tryGit(root, 'diff', '--name-status', base, branch).split('\n').filter(Boolean)) {
        const [s, p] = l.split('\t');
        names.set(norm(p), s.startsWith('A') ? 'A' : 'M');
      }
    }
    for (const l of tryGit(t.worktree, 'status', '--porcelain').split('\n').filter(Boolean)) {
      const p = norm(l.slice(3));
      if (!names.has(p)) names.set(p, l.startsWith('??') || l[0] === 'A' ? 'A' : 'M');
    }
    for (const [p, s] of names) {
      const where = branch || t.worktree;
      touch(p, s, { task: t.id, vendor: t.vendor, act: `${s === 'A' ? 'tạo mới' : 'sửa'} trong ${where}`, ...(numstat.get(p) ? { delta: numstat.get(p) } : {}) });
    }
  }
  return [...files.values()].sort((a, b) => a.path.localeCompare(b.path));
}

/** The text diff of one file as one task changed it (committed work first, then anything uncommitted). */
export function readDiff(root: string, taskId: string, path: string): string {
  let t: Task;
  try { t = readTask(root, taskId); } catch { throw new Error(`unknown task ${taskId}`); }
  const p = norm(path);
  if (!p || isAbsolute(p) || p.includes('\0') || normalize(p).split(/[\\/]/).includes('..')) throw new Error(`invalid path ${path}`);
  if (!t.worktree || !existsSync(t.worktree)) return '';
  const branch = branchName(t.id);
  const base = tryGit(root, 'merge-base', 'HEAD', branch);
  const committed = base ? tryGit(root, 'diff', base, branch, '--', p) : '';
  return committed || tryGit(t.worktree, 'diff', 'HEAD', '--', p);
}

export function readChat(root: string): ChatMsg[] {
  return readText(join(root, '.orch', 'chat.jsonl')).split('\n').filter(Boolean).flatMap(l => {
    try { const m = JSON.parse(l); return m && typeof m.text === 'string' ? [m as ChatMsg] : []; } catch { return []; }
  });
}

export function readSkills(root: string): UiSkill[] {
  const dir = join(root, 'skills');
  if (!existsSync(dir)) return [];
  let on: Record<string, Partial<Record<Vendor, boolean>>> = {};
  try { on = JSON.parse(readText(join(root, '.orch', 'skills.json')) || '{}'); } catch { /* corrupt file: start over */ }
  return readdirSync(dir, { withFileTypes: true })
    .filter(d => d.isDirectory() && existsSync(join(dir, d.name, 'SKILL.md')))
    .map(d => ({ name: d.name, path: `skills/${d.name}/SKILL.md`, on: on[d.name] ?? {} }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function buildState(root: string, now = Date.now(), extra: { running?: boolean } = {}): UiState {
  const tasks = listTasks(root);
  const runs = readRuns(root).sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
  const open = tasks.flatMap(t => {
    const q = readQuestions(root, t.id).find(x => x.a == null);
    return q ? [{ task: t.id, q: q.q }] : [];
  });
  return {
    root,
    now: new Date(now).toISOString(),
    running: !!extra.running,
    vendors: buildVendors(root, tasks, runs, now),
    tasks: buildTasks(root, tasks, runs, now),
    questions: open,
    runs: runs.slice(-200),
    files: collectFiles(root, tasks),
    agentsMd: readText(join(root, 'AGENTS.md')),
    skills: readSkills(root),
    chat: readChat(root),
  };
}
