import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { answerQuestion, appendContext, readTask, setStatus } from './store.ts';
import type { Vendor } from './types.ts';

export function answerTask(root: string, taskId: string, text: string): void {
  answerQuestion(root, taskId, text);
  appendContext(root, taskId, `Answer from user: ${text}`);
  setStatus(root, taskId, 'queued', { reason: undefined });
}

/** Only work that has not started can be cancelled one by one; a running task needs the whole run stopped. */
export function cancelTask(root: string, taskId: string): void {
  const t = readTask(root, taskId);
  if (t.status !== 'queued' && t.status !== 'blocked') throw new Error(`${taskId} is ${t.status}; only queued or blocked tasks can be cancelled`);
  setStatus(root, taskId, 'cancelled', { reason: 'cancelled by user' });
}

export function writeAgentsMd(root: string, text: string): void {
  if (text.length > 200_000) throw new Error('AGENTS.md is too large');
  writeFileSync(join(root, 'AGENTS.md'), text);
}

/** Which agents may use a skill; read again by the runner for every task. */
export function setSkill(root: string, name: string, vendor: Vendor, on: boolean): void {
  if (!/^[\w.-]+$/.test(name)) throw new Error(`invalid skill name ${name}`);
  const file = join(root, '.orch', 'skills.json');
  let all: Record<string, Partial<Record<Vendor, boolean>>> = {};
  try { all = JSON.parse(readFileSync(file, 'utf8')); } catch { /* first write */ }
  all[name] = { ...all[name], [vendor]: on };
  mkdirSync(join(root, '.orch'), { recursive: true });
  writeFileSync(file, JSON.stringify(all, null, 2) + '\n');
}

export function appendChat(root: string, who: 'me' | 'orch', text: string): void {
  mkdirSync(join(root, '.orch'), { recursive: true });
  writeFileSync(join(root, '.orch', 'chat.jsonl'), JSON.stringify({ ts: new Date().toISOString(), who, text }) + '\n', { flag: 'a' });
}
