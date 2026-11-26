import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpRoot } from './helpers.ts';

const CLI = join(import.meta.dirname, '..', 'src', 'cli.ts');
const orch = (cwd: string, ...args: string[]) => spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8' });

test('orch init creates .orch/config.json with defaults and AGENTS.md', () => {
  const root = tmpRoot();
  const r = orch(root, 'init');
  assert.equal(r.status, 0, r.stderr);
  const cfg = JSON.parse(readFileSync(join(root, '.orch', 'config.json'), 'utf8'));
  assert.equal(cfg.vendors.ollama.maxParallel, 1);
  assert.match(readFileSync(join(root, 'AGENTS.md'), 'utf8'), /report\.json/);
});

test('orch init keeps an existing AGENTS.md and config', () => {
  const root = tmpRoot();
  orch(root, 'init');
  writeFileSync(join(root, 'AGENTS.md'), 'mine');
  writeFileSync(join(root, '.orch', 'config.json'), JSON.stringify({ maxReviewRounds: 3 }));
  assert.equal(orch(root, 'init').status, 0);
  assert.equal(readFileSync(join(root, 'AGENTS.md'), 'utf8'), 'mine');
  assert.equal(JSON.parse(readFileSync(join(root, '.orch', 'config.json'), 'utf8')).maxReviewRounds, 3);
});

test('unknown command prints usage and exits 1', () => {
  const root = tmpRoot();
  const r = orch(root, 'frobnicate');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /usage: orch/);
  assert.equal(existsSync(join(root, '.orch')), false);
});

test('worker prompt template carries the report contract placeholders', () => {
  const t = readFileSync(join(import.meta.dirname, '..', 'templates', 'worker-prompt.md'), 'utf8');
  for (const s of ['{{taskDir}}', '{{id}}', '"verified"', '"questions"']) assert.ok(t.includes(s), s);
});

test('AGENTS.md template forbids secrets but not the task folder', () => {
  const t = readFileSync(join(import.meta.dirname, '..', 'templates', 'AGENTS.md'), 'utf8');
  assert.doesNotMatch(t, /listed in `\.gitignore`/);
  assert.match(t, /\.env/);
});
