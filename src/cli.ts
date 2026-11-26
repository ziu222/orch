#!/usr/bin/env node
import { copyFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadConfig, saveConfig } from './config.ts';
import { runEngine } from './engine.ts';
import { planRequest } from './planner.ts';
import {
  answerQuestion, appendContext, createTask, listTasks, nextTaskId, readQuestions, readRuns, setStatus,
} from './store.ts';
import type { Vendor } from './types.ts';
import { excludeOrch, mergeWorktree } from './worktree.ts';

const TEMPLATES = join(import.meta.dirname, '..', 'templates');
const VENDORS: Vendor[] = ['claude', 'codex', 'agy', 'copilot', 'ollama'];

const USAGE = `usage: orch <command>

commands:
  init                         create .orch/config.json and AGENTS.md in the current repo
  run "<request>"              plan and run a request across vendor CLIs
  run --resume                 resume queued/cancelled tasks without re-planning
  run --agent <v> "<prompt>"   run a single task directly on vendor <v>
  status                       show tasks and open questions
  stats                        show per-vendor task and token totals
  answer <taskId> "<text>"     answer a worker's open question and requeue the task
  merge <taskId>               merge a verified task's worktree branch into the current branch`;

export function initRepo(root: string): void {
  saveConfig(root, loadConfig(root));
  if (existsSync(join(root, '.git'))) excludeOrch(root);
  const agents = join(root, 'AGENTS.md');
  if (!existsSync(agents)) copyFileSync(join(TEMPLATES, 'AGENTS.md'), agents);
  console.log('orch initialised: .orch/config.json, AGENTS.md');
}

export function answerTask(root: string, taskId: string, text: string): void {
  answerQuestion(root, taskId, text);
  appendContext(root, taskId, `Answer from user: ${text}`);
  setStatus(root, taskId, 'queued', { reason: undefined });
}

export function formatStatus(root: string): string {
  const tasks = listTasks(root);
  if (tasks.length === 0) return 'No tasks.';
  const lines: string[] = [];
  for (const t of tasks) {
    const suffix = t.reason ? `  (${t.reason})` : '';
    lines.push(`${t.id}  ${t.status.padEnd(9)}  ${t.vendor.padEnd(7)}  ${t.title}${suffix}`);
    for (const q of readQuestions(root, t.id)) {
      if (q.a == null) lines.push(`  ? ${q.q}`);
    }
  }
  return lines.join('\n');
}

export function formatStats(root: string): string {
  const cfg = loadConfig(root);
  const tasks = listTasks(root);
  const runs = readRuns(root);
  const now = Date.now();
  const lines: string[] = [];
  for (const v of VENDORS) {
    const vTasks = tasks.filter(t => t.vendor === v).length;
    const vRuns = runs.filter(r => r.vendor === v);
    const tokensIn = vRuns.reduce((s, r) => s + r.tokensIn, 0);
    const tokensOut = vRuns.reduce((s, r) => s + r.tokensOut, 0);
    const estimated = vRuns.some(r => r.estimated);
    const pausedUntil = cfg.vendors[v]?.pausedUntil;
    const paused = pausedUntil && Date.parse(pausedUntil) > now ? `  paused until ${pausedUntil}` : '';
    const est = estimated ? '  (estimated)' : '';
    lines.push(`${v.padEnd(8)}  tasks=${String(vTasks).padEnd(3)}  in=${String(tokensIn).padEnd(8)}  out=${String(tokensOut).padEnd(8)}${est}${paused}`);
  }
  return lines.join('\n');
}

async function runCmd(root: string, args: string[]): Promise<number> {
  const ac = new AbortController();
  const onSignal = () => { ac.abort(); };
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);

  try {
    if (args[0] === '--resume') {
      for (const t of listTasks(root)) {
        if (t.status === 'cancelled') setStatus(root, t.id, 'queued', { reason: undefined });
      }
    } else if (args[0] === '--agent') {
      const vendor = args[1] as Vendor;
      const prompt = args.slice(2).join(' ').trim();
      if (!VENDORS.includes(vendor) || !prompt) {
        console.error('usage: orch run --agent <vendor> "<prompt>"');
        return 1;
      }
      const id = nextTaskId(root);
      createTask(root, { id, title: prompt.slice(0, 60), role: 'implement', vendor, deps: [], writesCode: vendor !== 'ollama' }, prompt);
    } else {
      const request = args.join(' ').trim();
      if (!request) {
        console.error('usage: orch run "<request>" | --resume | --agent <vendor> "<prompt>"');
        return 1;
      }
      await planRequest(root, request, { signal: ac.signal });
    }

    const res = await runEngine(root, { signal: ac.signal });
    if (ac.signal.aborted) return 130;
    console.log(`done=${res.done} failed=${res.failed} blocked=${res.blocked}`);
    for (const [v, until] of Object.entries(res.waiting)) {
      console.log(`waiting: ${v} paused until ${until}`);
    }
    return res.failed > 0 ? 1 : 0;
  } finally {
    process.off('SIGINT', onSignal);
    process.off('SIGTERM', onSignal);
  }
}

async function main(): Promise<void> {
  const root = process.cwd();
  const [cmd, ...rest] = process.argv.slice(2);
  if (cmd === 'init') {
    initRepo(root);
  } else if (cmd === 'run') {
    process.exitCode = await runCmd(root, rest);
  } else if (cmd === 'status') {
    console.log(formatStatus(root));
  } else if (cmd === 'stats') {
    console.log(formatStats(root));
  } else if (cmd === 'answer') {
    const [taskId, ...words] = rest;
    const text = words.join(' ').trim();
    if (!taskId || !text) {
      console.error('usage: orch answer <taskId> "<text>"');
      process.exit(1);
    }
    answerTask(root, taskId, text);
    console.log(`${taskId} answered and requeued`);
  } else if (cmd === 'merge') {
    const [taskId] = rest;
    if (!taskId) {
      console.error('usage: orch merge <taskId>');
      process.exit(1);
    }
    const r = mergeWorktree(root, taskId);
    console.log(r.message);
    if (!r.merged) process.exit(1);
  } else {
    console.error(USAGE);
    process.exit(1);
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch(e => {
    console.error((e as Error).message);
    process.exit(1);
  });
}
