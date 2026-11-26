import type { Adapter, Vendor } from '../types.ts';
import { claude } from './claude.ts';

export { isRateLimit, instruction } from './util.ts';

const ADAPTERS: Partial<Record<Vendor, Adapter>> = { claude };

export function getAdapter(v: Vendor): Adapter {
  const a = ADAPTERS[v];
  if (!a) throw new Error(`no adapter for vendor "${v}" yet`);
  return a;
}
