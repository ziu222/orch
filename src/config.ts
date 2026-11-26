import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Config } from './types.ts';

export function defaultConfig(): Config {
  return {
    vendors: {
      claude: { maxParallel: 2 },
      codex: { maxParallel: 2 },
      gemini: { maxParallel: 2 },
      ollama: { maxParallel: 1, model: 'qwen3-coder:30b' },
    },
    roles: {
      plan: { vendor: 'claude' },
      scout: { vendor: 'gemini', fallback: 'codex' },
      implement: { vendor: 'codex', fallback: 'claude' },
      review: { vendor: 'claude', fallback: 'codex' },
      verify: { vendor: 'codex' },
      summarize: { vendor: 'ollama', fallback: 'gemini' },
    },
    maxReviewRounds: 2,
    taskTimeoutSec: 1800,
  };
}

const configPath = (root: string) => join(root, '.orch', 'config.json');

export function loadConfig(root: string): Config {
  const c = defaultConfig();
  const p = configPath(root);
  if (!existsSync(p)) return c;
  let file: Partial<Config>;
  try {
    file = JSON.parse(readFileSync(p, 'utf8'));
  } catch (e) {
    throw new Error(`invalid ${p}: ${(e as Error).message}`);
  }
  validate(file, c, p);
  // ponytail: one level of per-key merge is all the config shape needs
  for (const k of ['vendors', 'roles'] as const) {
    for (const [name, v] of Object.entries(file[k] ?? {})) {
      (c[k] as Record<string, object>)[name] = { ...(c[k] as Record<string, object>)[name], ...v };
    }
  }
  if (file.maxReviewRounds != null) c.maxReviewRounds = file.maxReviewRounds;
  if (file.taskTimeoutSec != null) c.taskTimeoutSec = file.taskTimeoutSec;
  return c;
}

// reject typos and unknown names up front so a bad config never fails mid-run
function validate(file: unknown, d: Config, p: string): void {
  const fail = (m: string): never => { throw new Error(`invalid ${p}: ${m}`) };
  const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
  if (!isObj(file)) fail('expected a JSON object');
  const f = file as Record<string, unknown>;
  const vendors = Object.keys(d.vendors);
  for (const [name, v] of Object.entries(f.vendors ?? {})) {
    if (!vendors.includes(name)) fail(`unknown vendor "${name}"`);
    if (!isObj(v)) fail(`vendors.${name} must be an object`);
    for (const key of Object.keys(v as object)) if (!['maxParallel', 'model', 'pausedUntil'].includes(key)) fail(`unknown key vendors.${name}.${key}`);
    const mp = (v as Record<string, unknown>).maxParallel;
    if (mp !== undefined && !(Number.isInteger(mp) && (mp as number) > 0)) fail(`vendors.${name}.maxParallel must be a positive integer`);
  }
  for (const [name, r] of Object.entries(f.roles ?? {})) {
    if (!(name in d.roles)) fail(`unknown role "${name}"`);
    if (!isObj(r)) fail(`roles.${name} must be an object`);
    const { vendor, fallback } = r as Record<string, unknown>;
    if (vendor !== undefined && !vendors.includes(vendor as string)) fail(`roles.${name}.vendor "${vendor}" is not a known vendor`);
    if (fallback !== undefined && !vendors.includes(fallback as string)) fail(`roles.${name}.fallback "${fallback}" is not a known vendor`);
  }
}

export function saveConfig(root: string, c: Config): void {
  mkdirSync(join(root, '.orch'), { recursive: true });
  writeFileSync(configPath(root), JSON.stringify(c, null, 2) + '\n');
}
