#!/usr/bin/env node
import { copyFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig, saveConfig } from './config.ts';

const TEMPLATES = join(import.meta.dirname, '..', 'templates');
const USAGE = `usage: orch <command>

commands:
  init    create .orch/config.json and AGENTS.md in the current repo`;

function init(root: string): void {
  // loadConfig keeps any existing values; saving writes the merged result back
  saveConfig(root, loadConfig(root));
  const agents = join(root, 'AGENTS.md');
  if (!existsSync(agents)) copyFileSync(join(TEMPLATES, 'AGENTS.md'), agents);
  console.log('orch initialised: .orch/config.json, AGENTS.md');
}

const [cmd] = process.argv.slice(2);
if (cmd === 'init') init(process.cwd());
else {
  console.error(USAGE);
  process.exit(1);
}
