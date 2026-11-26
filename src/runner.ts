import { spawn, spawnSync } from 'node:child_process';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getAdapter as defaultGetAdapter } from './adapters/index.ts';
import { appendRun, readReport, taskDir } from './store.ts';
import type { Adapter, AdapterResult, Config, Report, SpawnAdapter, Task, Vendor } from './types.ts';

export type RunOutcome = {
  status: 'done' | 'failed' | 'blocked' | 'cancelled' | 'ratelimited';
  report: Report | null;
  result: AdapterResult;
  reason?: string;
};

const TEMPLATE = join(import.meta.dirname, '..', 'templates', 'worker-prompt.md');
const WIN = process.platform === 'win32';
const empty: AdapterResult = { text: '', tokensIn: 0, tokensOut: 0, rateLimited: false };

function buildPrompt(root: string, task: Task): string {
  const dir = taskDir(root, task.id);
  const head = readFileSync(TEMPLATE, 'utf8').replaceAll('{{taskDir}}', dir).replaceAll('{{id}}', task.id);
  const read = (f: string) => { try { return readFileSync(join(dir, f), 'utf8'); } catch { return ''; } };
  return `${head}\n\n## task.md\n\n${read('task.md')}\n\n## context.md\n\n${read('context.md')}\n`;
}

// one argument for cmd.exe / sh; our args never carry user text, but paths may hold spaces
const quote = (a: string) =>
  WIN ? (/[\s"&|<>^()%]/.test(a) ? `"${a.replace(/"/g, '""')}"` : a)
      : (/[^\w@%+=:,./-]/.test(a) ? `'${a.replace(/'/g, `'\\''`)}'` : a);

function killTree(pid: number | undefined): void {
  if (!pid) return;
  if (WIN) spawnSync('taskkill', ['/T', '/F', '/PID', String(pid)], { stdio: 'ignore' });
  else { try { process.kill(-pid, 'SIGKILL'); } catch { /* already gone */ } }
}

interface SpawnResult { stdout: string; stderr: string; code: number | null; missing: boolean; cancelled?: 'abort' | 'timeout' }

function runSpawn(cmd: string, cwd: string, signal: AbortSignal, timeoutMs: number): Promise<SpawnResult> {
  return new Promise(resolve => {
    // a single command string through the shell: .cmd shims work on Windows and no DEP0190 warning
    const child = spawn(cmd, { cwd, shell: true, stdio: ['ignore', 'pipe', 'pipe'], detached: !WIN, windowsHide: true });
    let stdout = '', stderr = '', cancelled: SpawnResult['cancelled'];
    child.stdout.on('data', d => (stdout += d));
    child.stderr.on('data', d => (stderr += d));
    const stop = (why: 'abort' | 'timeout') => { if (!cancelled) { cancelled = why; killTree(child.pid); } };
    const onAbort = () => stop('abort');
    if (signal.aborted) onAbort(); else signal.addEventListener('abort', onAbort, { once: true });
    const timer = setTimeout(() => stop('timeout'), timeoutMs);
    const done = (code: number | null, missing = false) => {
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
      resolve({ stdout, stderr, code, missing, cancelled });
    };
    child.on('error', () => done(null, true));
    child.on('close', code => {
      // cmd.exe: "is not recognized" (exit 1 or 9009); sh: exit 127
      const missing = code === 127 || code === 9009 || /is not recognized as an internal or external command|command not found|not found$/im.test(stderr);
      done(code, missing && !stdout.trim());
    });
  });
}

function command(adapter: SpawnAdapter, vendor: Vendor, promptFile: string, model?: string): string {
  const override = process.env[`ORCH_BIN_${vendor.toUpperCase()}`];
  return [override ?? quote(adapter.bin), ...adapter.args(promptFile, model).map(quote)].join(' ');
}

// a reply may wrap the report in a ```json fence or send it bare
function extractReport(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  for (const cand of [fenced?.[1], text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)]) {
    if (!cand) continue;
    try { return JSON.parse(cand); } catch { /* try next */ }
  }
  return null;
}

export async function runTask(
  root: string, task: Task, cfg: Config, signal: AbortSignal, cwd?: string,
  deps: { getAdapter?: (v: Vendor) => Adapter } = {},
): Promise<RunOutcome> {
  const dir = taskDir(root, task.id);
  const finish = (o: RunOutcome): RunOutcome => {
    appendRun(root, { task: task.id, vendor: task.vendor, event: o.reason ? `end · ${o.status} · ${o.reason}` : `end · ${o.status}`,
      tokensIn: o.result.tokensIn, tokensOut: o.result.tokensOut, ...(o.result.estimated ? { estimated: true } : {}) });
    return o;
  };

  let adapter: Adapter;
  try { adapter = (deps.getAdapter ?? defaultGetAdapter)(task.vendor); }
  catch (e) { return finish({ status: 'failed', report: null, result: empty, reason: (e as Error).message }); }
  if (adapter.kind === 'http' && task.writesCode) {
    return finish({ status: 'failed', report: null, result: empty, reason: `${task.vendor} cannot write code; route this task to a CLI vendor` });
  }

  const prompt = buildPrompt(root, task);
  const promptFile = join(dir, 'prompt.md');
  writeFileSync(promptFile, prompt);
  rmSync(join(dir, 'report.json'), { force: true }); // never judge this run by an earlier run's report
  appendRun(root, { task: task.id, vendor: task.vendor, event: 'start', tokensIn: 0, tokensOut: 0 });
  const model = cfg.vendors[task.vendor]?.model;
  const timeoutMs = cfg.taskTimeoutSec * 1000;
  let result: AdapterResult;

  if (adapter.kind === 'http') {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    const onAbort = () => ac.abort();
    signal.addEventListener('abort', onAbort, { once: true });
    result = await adapter.call(`${prompt}\n\nReply with the report.json object only, as JSON.`, model ?? '', ac.signal);
    clearTimeout(timer);
    signal.removeEventListener('abort', onAbort);
    writeFileSync(join(dir, 'output.log'), result.text + (result.error ? `\n[error] ${result.error}\n` : ''));
    if (ac.signal.aborted) return finish({ status: 'cancelled', report: null, result, reason: signal.aborted ? 'cancelled' : 'timed out' });
    const rep = extractReport(result.text);
    if (rep) writeFileSync(join(dir, 'report.json'), JSON.stringify(rep, null, 2));
  } else {
    const r = await runSpawn(command(adapter, task.vendor, promptFile, model), cwd ?? root, signal, timeoutMs);
    writeFileSync(join(dir, 'output.log'), `${r.stdout}\n--- stderr ---\n${r.stderr}`);
    if (r.cancelled) return finish({ status: 'cancelled', report: null, result: empty, reason: r.cancelled === 'abort' ? 'cancelled' : `timed out after ${cfg.taskTimeoutSec}s` });
    if (r.missing) return finish({ status: 'failed', report: null, result: empty, reason: `${adapter.bin} not found or not logged in` });
    result = adapter.parse(r.stdout, r.stderr, r.code ?? -1);
  }

  if (result.rateLimited) return finish({ status: 'ratelimited', report: null, result, reason: result.error });
  const report = readReport(root, task.id);
  if (!report) return finish({ status: 'failed', report: null, result, reason: result.error ? `${task.vendor}: ${result.error}` : 'no valid report.json' });
  if (report.questions?.length) return finish({ status: 'blocked', report, result });
  if (!report.verified) return finish({ status: 'failed', report, result, reason: 'report not verified' });
  return finish({ status: 'done', report, result });
}
