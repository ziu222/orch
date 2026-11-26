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

export function saveConfig(root: string, c: Config): void {
  mkdirSync(join(root, '.orch'), { recursive: true });
  writeFileSync(configPath(root), JSON.stringify(c, null, 2) + '\n');
}
