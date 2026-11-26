// Stand-in for `node src/cli.ts` in server tests: records its arguments and prints a run summary.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
mkdirSync(join(process.cwd(), '.orch'), { recursive: true });
writeFileSync(join(process.cwd(), '.orch', 'fake-args.txt'), args.join('\n'));
if (args.includes('sleep')) setInterval(() => {}, 1000); // stays alive until killed
else console.log('done=1 failed=0 blocked=0');
