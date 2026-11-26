// Stand-in for a vendor CLI in runner tests. Usage: node fake-cli.mjs <mode> [vendor args...]
// The vendor args end with "Read <promptFile> and follow it."; the task folder is the prompt's folder.
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const [mode, ...rest] = process.argv.slice(2);
const instr = rest.find(a => a.startsWith('Read ')) ?? '';
const promptFile = instr.replace(/^Read /, '').replace(/ and follow it\.$/, '');
const dir = dirname(promptFile);
const report = (r) => writeFileSync(join(dir, 'report.json'), JSON.stringify(r));
const result = (extra = {}) => process.stdout.write(JSON.stringify({
  type: 'result', is_error: false, result: 'done', usage: { input_tokens: 100, output_tokens: 20 }, ...extra,
}));
const base = { summary: 'did it', files: [{ path: 'src/a.ts', lines: '1-5' }], confidence: 'high' };

switch (mode) {
  case 'ok': report({ ...base, verified: true }); result(); break;
  case 'noreport': result(); break;
  case 'unverified': report({ ...base, verified: false }); result(); break;
  case 'question': report({ ...base, verified: false, questions: ['Which mailer?'] }); result(); break;
  case 'ratelimit':
    result({ is_error: true, api_error_status: 429, result: 'Claude AI usage limit reached' });
    process.exitCode = 1;
    break;
  case 'hang':
    writeFileSync(join(dir, 'pid.txt'), String(process.pid));
    setInterval(() => {}, 1000);
    break;
  case 'orphan': {
    // leaves a background process holding our stdout, like a worker that starts a dev server
    const { spawn } = await import('node:child_process');
    const g = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 30000)'], { stdio: 'inherit', detached: true });
    writeFileSync(join(dir, 'orphan.txt'), String(g.pid));
    report({ ...base, verified: true }); result(); g.unref(); process.exit(0);
  }
  case 'unicode': report({ ...base, verified: true }); result({ result: 'ệ'.repeat(40000) }); break;
  default: process.stderr.write(`fake-cli: unknown mode ${mode}`); process.exitCode = 2;
}
