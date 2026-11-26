import { loadConfig } from './config.ts';
import { validateDag } from './engine.ts';
import { runTask } from './runner.ts';
import { createTask, nextTaskId, setStatus } from './store.ts';
import type { Config, Role, Task, Vendor } from './types.ts';

interface PlanItem {
  key: string;
  title: string;
  role: Role;
  deps: string[];
  writesCode: boolean;
  brief: string;
  reviewOf?: string;
}

const VALID_ROLES = new Set<Role>(['scout', 'implement', 'review', 'verify', 'summarize']);

function extractPlanJson(text: string): { tasks?: unknown } | null {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const candidates = [fenced?.[1], text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)];
  for (const c of candidates) {
    if (!c) continue;
    try {
      const parsed = JSON.parse(c);
      if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { tasks?: unknown }).tasks)) {
        return parsed as { tasks: unknown };
      }
    } catch { /* try next */ }
  }
  return null;
}

function pickReviewerVendor(cfg: Config, author: Vendor): Vendor {
  const role = cfg.roles.review;
  const candidates: (Vendor | undefined)[] = [role?.vendor, role?.fallback, 'claude', 'codex', 'agy', 'copilot'];
  const found = candidates.find((v): v is Vendor => !!v && v !== author && v !== 'ollama');
  if (!found) throw new Error(`cross-vendor review required: no reviewer vendor other than ${author}`);
  return found;
}

function buildPlanTaskMd(request: string): string {
  return [
    `Break the following request into a task DAG for orch workers.`,
    ``,
    `Request: ${request}`,
    ``,
    `In your final response (and in report.json summary), include a fenced \`\`\`json block with shape:`,
    '```json',
    `{ "tasks": [{ "key": "scout-1", "title": "...", "role": "scout|implement|review|verify|summarize", "deps": [], "writesCode": false, "brief": "..." }] }`,
    '```',
  ].join('\n');
}

export async function planRequest(
  root: string,
  request: string,
  opts: { run?: typeof runTask; signal?: AbortSignal } = {},
): Promise<Task[]> {
  const cfg = loadConfig(root);
  const run = opts.run ?? runTask;
  const signal = opts.signal ?? new AbortController().signal;
  const planId = nextTaskId(root);
  const planTask = createTask(
    root,
    { id: planId, title: `Plan: ${request.slice(0, 60)}`, role: 'plan', vendor: cfg.roles.plan.vendor, deps: [], writesCode: false },
    buildPlanTaskMd(request),
  );
  setStatus(root, planId, 'running');
  const outcome = await run(root, planTask, cfg, signal);
  const finalStatus = outcome.status === 'done' ? 'done' : outcome.status === 'cancelled' ? 'cancelled' : 'failed';
  setStatus(root, planId, finalStatus, { reason: outcome.reason });
  if (outcome.status !== 'done') {
    throw new Error(`planner ${planId} ${outcome.status}${outcome.reason ? `: ${outcome.reason}` : ''}`);
  }

  const raw = extractPlanJson(outcome.result.text) ?? extractPlanJson(outcome.report?.summary ?? '');
  if (!raw || !Array.isArray(raw.tasks) || raw.tasks.length === 0) {
    throw new Error(`planner ${planId} returned no valid task plan`);
  }

  const items: PlanItem[] = [];
  const seenKeys = new Set<string>();
  for (const entry of raw.tasks) {
    const o = entry as Partial<PlanItem> | null;
    if (!o || typeof o !== 'object') throw new Error('invalid plan item: expected object');
    if (typeof o.key !== 'string' || !o.key.trim()) throw new Error('invalid plan item: missing key');
    if (seenKeys.has(o.key)) throw new Error(`duplicate plan key "${o.key}"`);
    seenKeys.add(o.key);
    if (typeof o.title !== 'string' || !o.title.trim()) throw new Error(`invalid plan item "${o.key}": missing title`);
    if (!VALID_ROLES.has(o.role as Role)) throw new Error(`invalid plan item "${o.key}": invalid role "${String(o.role)}"`);
    if (!Array.isArray(o.deps) || !o.deps.every(d => typeof d === 'string')) throw new Error(`invalid plan item "${o.key}": deps must be string[]`);
    items.push({
      key: o.key,
      title: o.title,
      role: o.role as Role,
      deps: o.deps,
      writesCode: Boolean(o.writesCode),
      brief: typeof o.brief === 'string' && o.brief.trim() ? o.brief : o.title,
      ...(typeof o.reviewOf === 'string' ? { reviewOf: o.reviewOf } : {}),
    });
  }

  // validate DAG on keys before creating any task on disk
  const dagErr = validateDag(items.map(i => ({ id: i.key, deps: i.deps })));
  if (dagErr) throw new Error(dagErr);

  const baseNum = Number(nextTaskId(root).slice(2));
  const keyToId = new Map<string, string>();
  const keyToVendor = new Map<string, Vendor>();
  const keyToItem = new Map<string, PlanItem>();

  items.forEach((item, idx) => {
    keyToId.set(item.key, 'T-' + String(baseNum + idx).padStart(3, '0'));
    keyToItem.set(item.key, item);
  });

  // first pass: assign non-review vendors
  for (const item of items) {
    if (item.role !== 'review') {
      let v = cfg.roles[item.role].vendor;
      if (item.writesCode && v === 'ollama') v = cfg.roles.implement.vendor;
      keyToVendor.set(item.key, v);
    }
  }

  // second pass: assign review vendors ensuring cross-vendor review
  const created: Task[] = [];
  for (const item of items) {
    const id = keyToId.get(item.key)!;
    const deps = item.deps.map(d => keyToId.get(d)!);
    let reviewOfId: string | undefined;
    let vendor: Vendor;
    if (item.role === 'review') {
      const targetKey = item.reviewOf ?? item.deps.find(d => keyToItem.get(d)?.role === 'implement');
      const author = targetKey ? keyToVendor.get(targetKey) : undefined;
      reviewOfId = targetKey ? keyToId.get(targetKey) : undefined;
      vendor = author ? pickReviewerVendor(cfg, author) : cfg.roles.review.vendor;
      keyToVendor.set(item.key, vendor);
    } else {
      vendor = keyToVendor.get(item.key)!;
    }
    created.push(
      createTask(
        root,
        {
          id,
          title: item.title,
          role: item.role,
          vendor,
          deps,
          writesCode: item.writesCode,
          ...(reviewOfId ? { reviewOf: reviewOfId, round: 1 } : {}),
        },
        item.brief,
      ),
    );
  }

  return created;
}
