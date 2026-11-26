import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Report, RunEvent, Task, TaskStatus } from './types.ts';

const orch = (root: string) => join(root, '.orch');
export const taskDir = (root: string, id: string) => join(orch(root), 'tasks', id);
const taskJson = (root: string, id: string) => join(taskDir(root, id), 'task.json');

const readJsonl = <T>(p: string): T[] =>
  existsSync(p) ? readFileSync(p, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l) as T) : [];

export function createTask(root: string, t: Omit<Task, 'status'>, taskMd: string, contextMd = ''): Task {
  const task: Task = { ...t, status: 'queued' };
  mkdirSync(taskDir(root, t.id), { recursive: true });
  writeFileSync(taskJson(root, t.id), JSON.stringify(task, null, 2));
  writeFileSync(join(taskDir(root, t.id), 'task.md'), taskMd);
  writeFileSync(join(taskDir(root, t.id), 'context.md'), contextMd);
  return task;
}

export const readTask = (root: string, id: string): Task => JSON.parse(readFileSync(taskJson(root, id), 'utf8'));

export function listTasks(root: string): Task[] {
  const dir = join(orch(root), 'tasks');
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter(id => existsSync(taskJson(root, id))).sort().map(id => readTask(root, id));
}

export function setStatus(root: string, id: string, s: TaskStatus, extra: Partial<Task> = {}): Task {
  const t: Task = { ...readTask(root, id), ...extra, status: s };
  writeFileSync(taskJson(root, id), JSON.stringify(t, null, 2));
  return t;
}

export function nextTaskId(root: string): string {
  const n = listTasks(root).reduce((m, t) => Math.max(m, Number(t.id.slice(2)) || 0), 0);
  return 'T-' + String(n + 1).padStart(3, '0');
}

export function readReport(root: string, id: string): Report | null {
  try {
    return JSON.parse(readFileSync(join(taskDir(root, id), 'report.json'), 'utf8'));
  } catch {
    return null;
  }
}

export function appendContext(root: string, id: string, text: string): void {
  appendFileSync(join(taskDir(root, id), 'context.md'), `\n\n${text}\n`);
}

export function appendRun(root: string, e: Omit<RunEvent, 'ts'>): void {
  mkdirSync(orch(root), { recursive: true });
  appendFileSync(join(orch(root), 'runs.jsonl'), JSON.stringify({ ts: new Date().toISOString(), ...e }) + '\n');
}

export const readRuns = (root: string): RunEvent[] => readJsonl<RunEvent>(join(orch(root), 'runs.jsonl'));

const qPath = (root: string, id: string) => join(taskDir(root, id), 'questions.jsonl');

export function appendQuestion(root: string, id: string, q: string): void {
  appendFileSync(qPath(root, id), JSON.stringify({ q }) + '\n');
}

export const readQuestions = (root: string, id: string): { q: string; a?: string }[] => readJsonl(qPath(root, id));

// answers the oldest open question
export function answerQuestion(root: string, id: string, a: string): void {
  const qs = readQuestions(root, id);
  const open = qs.find(x => x.a == null);
  if (!open) throw new Error(`${id} has no open question`);
  open.a = a;
  writeFileSync(qPath(root, id), qs.map(x => JSON.stringify(x)).join('\n') + '\n');
}
