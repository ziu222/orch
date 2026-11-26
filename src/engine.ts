import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig, saveConfig } from './config.ts';
import { runTask, type RunOutcome } from './runner.ts';
import {
  appendContext, appendQuestion, appendRun, createTask, listTasks, nextTaskId, readReport, readTask, setStatus,
} from './store.ts';
import { ensureWorktree } from './worktree.ts';
import type { Config, Task, Vendor } from './types.ts';

const DEFAULT_PAUSE_MS = 5 * 3600_000;

export function validateDag(tasks: Pick<Task, 'id' | 'deps'>[]): string | null {
  const byId = new Map(tasks.map(t => [t.id, t]));
  for (const t of tasks) for (const d of t.deps) if (!byId.has(d)) return `${t.id} depends on missing ${d}`;
  const colour = new Map<string, 'grey' | 'black'>();
  const visit = (id: string, path: string[]): string | null => {
    if (colour.get(id) === 'black') return null;
    if (colour.get(id) === 'grey') return `cycle: ${[...path.slice(path.indexOf(id)), id].join(' → ')}`;
    colour.set(id, 'grey');
    for (const d of byId.get(id)!.deps) { const c = visit(d, [...path, id]); if (c) return c; }
    colour.set(id, 'black');
    return null;
  };
  for (const t of tasks) { const c = visit(t.id, []); if (c) return c; }
  return null;
}

export interface EngineResult { done: number; failed: number; blocked: number; waiting: Partial<Record<Vendor, string>> }

export async function runEngine(
  root: string,
  opts: { signal?: AbortSignal; run?: typeof runTask; now?: () => Date } = {},
): Promise<EngineResult> {
  const run = opts.run ?? runTask;
  const now = opts.now ?? (() => new Date());
  const signal = opts.signal ?? new AbortController().signal;
  const err = validateDag(listTasks(root));
  if (err) throw new Error(err);

  let cfg: Config = loadConfig(root);
  const running = new Map<string, Promise<void>>();
  const runningVendor = new Map<string, Vendor>();
  const live = (v: Vendor) => [...runningVendor.values()].filter(x => x === v).length;
  const paused = (v: Vendor) => { const u = cfg.vendors[v]?.pausedUntil; return !!u && Date.parse(u) > now().getTime(); };

  // the vendor a task should run on right now, or null if it has to wait
  const pickVendor = (t: Task): Vendor | null => {
    const role = cfg.roles[t.role];
    let author: Vendor | undefined;
    if (t.reviewOf) { try { author = readTask(root, t.reviewOf).vendor; } catch { /* reviewed task gone */ } }
    const ok = (v: Vendor | undefined): v is Vendor => !!v && !paused(v) && !(t.writesCode && v === 'ollama') && v !== author;
    // own vendor, then the role's main vendor, then its fallback
    return [t.vendor, role?.vendor, role?.fallback].find(ok) ?? null;
  };

  const handoff = (t: Task) => {
    if (t.handedOff) return;
    for (const d of t.deps) {
      const r = readReport(root, d);
      if (!r) continue;
      const files = r.files.map(f => (f.lines ? `${f.path}:${f.lines}` : f.path)).join(', ');
      appendContext(root, t.id, `### From ${d}\n${r.summary}${files ? `\nFiles: ${files}` : ''}`);
    }
    setStatus(root, t.id, t.status, { handedOff: true });
  };

  const pickReviewer = (author: Vendor, preferred?: Vendor): Vendor => {
    const role = cfg.roles.review;
    const candidates: (Vendor | undefined)[] = [preferred, role?.vendor, role?.fallback, 'claude', 'codex', 'agy', 'copilot'];
    const found = candidates.find((v): v is Vendor => !!v && v !== author && v !== 'ollama');
    if (!found) throw new Error(`cross-vendor review required: no reviewer vendor other than ${author}`);
    return found;
  };

  const settle = (t: Task, o: RunOutcome) => {
    if (o.status === 'ratelimited') {
      const given = Date.parse(o.result.resetAt ?? '');
      const until = given > now().getTime() ? o.result.resetAt! : new Date(now().getTime() + DEFAULT_PAUSE_MS).toISOString();
      cfg = loadConfig(root);
      cfg.vendors[t.vendor] = { ...cfg.vendors[t.vendor], pausedUntil: until };
      saveConfig(root, cfg);
      appendRun(root, { task: t.id, vendor: t.vendor, event: `paused until ${until}`, tokensIn: 0, tokensOut: 0 });
      setStatus(root, t.id, 'queued', { reason: `rate limited on ${t.vendor}` });
      return;
    }
    if (o.status === 'blocked' && o.report?.questions?.length) {
      for (const q of o.report.questions) appendQuestion(root, t.id, q);
      appendRun(root, { task: t.id, vendor: t.vendor, event: 'question', tokensIn: 0, tokensOut: 0 });
      setStatus(root, t.id, 'blocked', { reason: o.reason ?? 'waiting for answer' });
      return;
    }
    if (o.status === 'done' && t.role === 'review' && t.reviewOf && o.report?.findings?.length) {
      const round = t.round ?? 1;
      if (round >= cfg.maxReviewRounds) {
        const q = `Review still has findings after ${cfg.maxReviewRounds} rounds: ${o.report.findings.join('; ')}. Merge anyway, or give direction?`;
        appendQuestion(root, t.id, q);
        appendRun(root, { task: t.id, vendor: t.vendor, event: 'question', tokensIn: 0, tokensOut: 0 });
        setStatus(root, t.id, 'blocked', { reason: `review findings after ${cfg.maxReviewRounds} rounds` });
        return;
      }
      setStatus(root, t.id, 'done', { reason: undefined });
      const impl = readTask(root, t.reviewOf);
      const fixId = nextTaskId(root);
      const findingsMd = `### Findings from ${t.id}\n${o.report.findings.map(f => `- ${f}`).join('\n')}`;
      createTask(
        root,
        {
          id: fixId,
          title: `Fix review findings for ${impl.id} (round ${round})`,
          role: 'implement',
          vendor: impl.vendor,
          deps: [t.id],
          writesCode: true,
          ...(impl.worktree ? { worktree: impl.worktree } : {}),
        },
        `Address the review findings from ${t.id} on ${impl.id}.`,
        findingsMd,
      );
      const reviewId = nextTaskId(root);
      createTask(
        root,
        {
          id: reviewId,
          title: `Review ${impl.id} (round ${round + 1})`,
          role: 'review',
          vendor: pickReviewer(impl.vendor, t.vendor),
          deps: [fixId],
          writesCode: false,
          reviewOf: impl.id,
          round: round + 1,
        },
        `Re-review ${impl.id} after fixes in ${fixId}.`,
      );
      return;
    }
    const status = o.status === 'done' ? 'done' : o.status; // failed | blocked | cancelled
    setStatus(root, t.id, status, { reason: o.reason });
  };

  for (;;) {
    const tasks = listTasks(root);
    const status = new Map(tasks.map(t => [t.id, t.status]));
    // a failed, cancelled or blocked dependency blocks its dependants
    // not while aborting: a Ctrl+C'd run should resume as it was, not with dependants blocked
    let changed = !signal.aborted;
    while (changed) {
      changed = false;
      for (const t of tasks) {
        if (t.status !== 'queued') continue;
        const bad = t.deps.find(d => ['failed', 'cancelled'].includes(status.get(d)!) || (status.get(d) === 'blocked' && readTask(root, d).reason?.startsWith('dependency')));
        if (bad) { setStatus(root, t.id, 'blocked', { reason: `dependency ${bad} failed` }); status.set(t.id, 'blocked'); t.status = 'blocked'; changed = true; }
      }
    }

    if (!signal.aborted) {
      for (const t of tasks) {
        if (t.status !== 'queued' || running.has(t.id)) continue;
        if (!t.deps.every(d => status.get(d) === 'done')) continue;
        const v = pickVendor(t);
        if (!v || live(v) >= cfg.vendors[v].maxParallel) continue;
        handoff(t);
        const worktree = t.worktree ?? (t.writesCode && existsSync(join(root, '.git')) ? ensureWorktree(root, t.id) : undefined);
        const started = setStatus(root, t.id, 'running', { vendor: v, ...(worktree ? { worktree } : {}) });
        runningVendor.set(t.id, v);
        running.set(t.id, (async () => {
          let o: RunOutcome;
          try { o = await run(root, started, cfg, signal, started.worktree); }
          catch (e) { o = { status: signal.aborted ? 'cancelled' : 'failed', report: null, result: { text: '', tokensIn: 0, tokensOut: 0, rateLimited: false }, reason: (e as Error).message }; }
          try { settle(started, o); }
          catch (e) { try { setStatus(root, t.id, 'failed', { reason: `could not record outcome: ${(e as Error).message}` }); } catch { /* disk unusable */ } }
        })().finally(() => { running.delete(t.id); runningVendor.delete(t.id); }));
      }
    }

    if (running.size === 0) break;
    await Promise.race(running.values());
  }

  const final = listTasks(root);
  const waiting: EngineResult['waiting'] = {};
  for (const t of final) {
    if (t.status !== 'queued') continue;
    const u = cfg.vendors[t.vendor]?.pausedUntil;
    if (u && paused(t.vendor)) waiting[t.vendor] = u;
  }
  const count = (s: Task['status']) => final.filter(t => t.status === s).length;
  return { done: count('done'), failed: count('failed'), blocked: count('blocked'), waiting };
}
