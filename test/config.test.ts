import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpRoot } from './helpers.ts';
import { defaultConfig, loadConfig, saveConfig } from '../src/config.ts';

test('defaults follow the spec', () => {
  const c = defaultConfig();
  assert.deepEqual(
    Object.fromEntries(Object.entries(c.vendors).map(([k, v]) => [k, v.maxParallel])),
    { claude: 2, codex: 2, agy: 2, copilot: 2, ollama: 1 },
  );
  assert.equal(c.vendors.ollama.model, 'qwen3-coder:30b');
  assert.deepEqual(c.roles.scout, { vendor: 'agy', fallback: 'codex' });
  assert.deepEqual(c.roles.summarize, { vendor: 'ollama', fallback: 'agy' });
  assert.equal(c.maxReviewRounds, 2);
  assert.equal(c.taskTimeoutSec, 1800);
});

test('file overrides merge per key over defaults', () => {
  const root = tmpRoot();
  mkdirSync(join(root, '.orch'));
  writeFileSync(join(root, '.orch', 'config.json'), JSON.stringify({ vendors: { claude: { maxParallel: 1 } } }));
  const c = loadConfig(root);
  assert.equal(c.vendors.claude.maxParallel, 1);
  assert.equal(c.vendors.codex.maxParallel, 2);
  assert.equal(c.roles.plan.vendor, 'claude');
});

test('missing file gives defaults; save then load round-trips', () => {
  const root = tmpRoot();
  assert.deepEqual(loadConfig(root), defaultConfig());
  const c = defaultConfig();
  c.vendors.agy.pausedUntil = '2026-11-26T20:00:00.000Z';
  saveConfig(root, c);
  assert.equal(loadConfig(root).vendors.agy.pausedUntil, '2026-11-26T20:00:00.000Z');
});

test('invalid config.json fails loudly with the path', () => {
  const root = tmpRoot();
  mkdirSync(join(root, '.orch'));
  writeFileSync(join(root, '.orch', 'config.json'), '{bad');
  assert.throws(() => loadConfig(root), /config\.json/);
});

test('config rejects null, unknown names, typos and bad vendors with the path', () => {
  const bad = [
    'null',
    '{"vendors":{"claude":{"maxparallel":5}}}',
    '{"vendors":{"grok":{"maxParallel":1}}}',
    '{"roles":{"review":{"vendor":"claud"}}}',
    '{"roles":{"scout":{"vendor":"agy","fallback":"x"}}}',
    '{"vendors":{"codex":{"maxParallel":0}}}',
  ];
  for (const b of bad) {
    const root = tmpRoot();
    mkdirSync(join(root, '.orch'));
    writeFileSync(join(root, '.orch', 'config.json'), b);
    assert.throws(() => loadConfig(root), /config\.json/, b);
  }
});
