import { loadConfig, saveConfig } from './config.ts';
import { runTask, type RunOutcome } from './runner.ts';
import { appendContext, appendRun, listTasks, readReport, readTask, setStatus } from './store.ts';
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
  const live = (v: Vendor) => [...running.keys()].filter(id => readTask(root, id).vendor === v).length;
  const paused = (v: Vendor) => { const u = cfg.vendors[v]?.pausedUntil; return !!u && Date.parse(u) > now().getTime(); };

  // the vendor a task should run on right now, or null if it has to wait
  const pickVendor = (t: Task): Vendor | null => {
    const role = cfg.roles[t.role];
    const ok = (v: Vendor | undefined): v is Vendor => !!v && !paused(v) && !(t.writesCode && v === 'ollama');
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

  const settle = (t: Task, o: RunOutcome) => {
    if (o.status === 'ratelimited') {
      const until = o.result.resetAt ?? new Date(now().getTime() + DEFAULT_PAUSE_MS).toISOString();
      cfg = loadConfig(root);
      cfg.vendors[t.vendor] = { ...cfg.vendors[t.vendor], pausedUntil: until };
      saveConfig(root, cfg);
      appendRun(root, { task: t.id, vendor: t.vendor, event: `paused until ${until}`, tokensIn: 0, tokensOut: 0 });
      setStatus(root, t.id, 'queued', { reason: `rate limited on ${t.vendor}` });
      return;
    }
    const status = o.status === 'done' ? 'done' : o.status; // failed | blocked | cancelled
    setStatus(root, t.id, status, o.reason ? { reason: o.reason } : {});
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
        const started = setStatus(root, t.id, 'running', { vendor: v });
        running.set(t.id, (async () => {
          let o: RunOutcome;
          try { o = await run(root, started, cfg, signal, started.worktree); }
          catch (e) { o = { status: 'failed', report: null, result: { text: '', tokensIn: 0, tokensOut: 0, rateLimited: false }, reason: (e as Error).message }; }
          settle(started, o);
        })().finally(() => running.delete(t.id)));
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
