import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const tmpRoot = (): string => mkdtempSync(join(tmpdir(), 'orch-'));
