import type { Adapter, Vendor } from '../types.ts';
import { claude } from './claude.ts';
import { codex } from './codex.ts';
import { agy } from './agy.ts';
import { copilot } from './copilot.ts';
import { ollama } from './ollama.ts';

export { isRateLimit, instruction, retryAfter } from './util.ts';

const ADAPTERS: Partial<Record<Vendor, Adapter>> = { claude, codex, agy, copilot, ollama };

export function getAdapter(v: Vendor): Adapter {
  const a = ADAPTERS[v];
  if (!a) throw new Error(`no adapter for vendor "${v}" yet`);
  return a;
}
