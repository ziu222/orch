// Builds a throwaway repo with realistic .orch state so `orch ui` has something to show without spending quota.
// usage: node scripts/seed-demo.ts <dir>
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { defaultConfig, saveConfig } from '../src/config.ts';
import { appendQuestion, createTask, setStatus, taskDir } from '../src/store.ts';
import { commitWorktree, ensureWorktree, excludeOrch } from '../src/worktree.ts';
import type { Task } from '../src/types.ts';

const dir = process.argv[2];
if (!dir) { console.error('usage: node scripts/seed-demo.ts <dir>'); process.exit(1); }
const git = (cwd: string, ...a: string[]) => execFileSync('git', a, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

mkdirSync(join(dir, 'src', 'auth'), { recursive: true });
mkdirSync(join(dir, 'src', 'routes'), { recursive: true });
git(dir, 'init', '-q', '-b', 'main'); git(dir, 'config', 'user.email', 'demo@example.test'); git(dir, 'config', 'user.name', 'demo');
writeFileSync(join(dir, 'README.md'), '# typing-web\n');
writeFileSync(join(dir, 'package.json'), '{ "name": "typing-web" }\n');
writeFileSync(join(dir, 'src', 'auth', 'login.ts'), 'export function login() {}\n');
writeFileSync(join(dir, 'src', 'auth', 'session.ts'), 'export function createSession() {\n  return store.set(userId, token)\n}\n');
writeFileSync(join(dir, 'src', 'routes', 'auth.ts'), "router.post('/login', login)\n");
git(dir, 'add', '-A'); git(dir, 'commit', '-q', '-m', 'init');
excludeOrch(dir);
copyFileSync(join(import.meta.dirname, '..', 'templates', 'AGENTS.md'), join(dir, 'AGENTS.md'));
for (const [name, body] of [['code-review', '# Code review\nCheck the diff for bugs first.'], ['verification-before-completion', '# Verification\nRun a check before saying done.']]) {
  mkdirSync(join(dir, 'skills', name), { recursive: true });
  writeFileSync(join(dir, 'skills', name, 'SKILL.md'), body);
}
mkdirSync(join(dir, '.orch'), { recursive: true });
writeFileSync(join(dir, '.orch', 'skills.json'), JSON.stringify({ 'code-review': { claude: true, codex: true }, 'verification-before-completion': { claude: true, codex: true, agy: true, ollama: true } }));

const cfg = defaultConfig();
Object.assign(cfg.vendors.claude, { budget5h: 160_000, budgetWeek: 900_000 });
Object.assign(cfg.vendors.codex, { budget5h: 120_000, budgetWeek: 700_000 });
saveConfig(dir, cfg);

const mk = (t: Omit<Task, 'status'>, brief: string) => createTask(dir, t, brief);
mk({ id: 'T-001', title: 'Lập kế hoạch', role: 'plan', vendor: 'claude', deps: [], writesCode: false }, 'plan');
mk({ id: 'T-002', title: 'Khảo sát auth', role: 'scout', vendor: 'agy', deps: ['T-001'], writesCode: false }, 'scout auth');
mk({ id: 'T-003', title: 'Khảo sát gửi mail', role: 'scout', vendor: 'agy', deps: ['T-001'], writesCode: false }, 'scout mail');
mk({ id: 'T-004', title: 'Nén context auth', role: 'summarize', vendor: 'ollama', deps: ['T-001'], writesCode: false }, 'summarise');
mk({ id: 'T-005', title: 'Viết reset mật khẩu', role: 'implement', vendor: 'codex', deps: ['T-002', 'T-004'], writesCode: true }, 'implement reset');
mk({ id: 'T-006', title: 'Review chéo', role: 'review', vendor: 'claude', deps: ['T-003', 'T-005'], writesCode: false, reviewOf: 'T-005', round: 1 }, 'review');
mk({ id: 'T-007', title: 'Verify: chạy test', role: 'verify', vendor: 'codex', deps: ['T-006'], writesCode: false }, 'verify');
for (const id of ['T-001', 'T-002', 'T-004']) setStatus(dir, id, 'done');
setStatus(dir, 'T-003', 'blocked'); appendQuestion(dir, 'T-003', 'Template email reset viết tiếng Việt hay tiếng Anh? Repo có cả emails/vi và emails/en.');

const report = (id: string, summary: string, files: { path: string; lines?: string }[]) =>
  writeFileSync(join(taskDir(dir, id), 'report.json'), JSON.stringify({ summary, files, verified: true, confidence: 'high' }));
report('T-001', 'Chia yêu cầu "reset mật khẩu" thành 6 task.', []);
report('T-002', 'Luồng đăng nhập ở src/auth/login.ts:1. Session lưu ở src/auth/session.ts:1. Chưa có bảng token reset.', [{ path: 'src/auth/login.ts', lines: '1-1' }, { path: 'src/auth/session.ts', lines: '1-3' }]);
report('T-004', 'Nén 22k token code auth còn 900 token tóm tắt. Chạy trên máy.', [{ path: 'src/auth/login.ts' }]);

const wt = ensureWorktree(dir, 'T-005');
writeFileSync(join(wt, 'src', 'auth', 'reset.ts'), "import { sendMail } from '../lib/mailer'\n\nexport async function requestReset(email: string) {\n  const user = await users.findByEmail(email)\n  if (!user) return // không lộ email có tồn tại hay không\n  await sendMail(user.email, 'reset', { token: randomToken() })\n}\n");
writeFileSync(join(wt, 'src', 'auth', 'session.ts'), 'export async function createSession() {\n  await store.set(userId, token)\n  return token\n}\n');
commitWorktree(wt, 'feat(T-005): Viết reset mật khẩu');
setStatus(dir, 'T-005', 'running', { worktree: wt });

const now = Date.now();
const run = (min: number, task: string, vendor: string, event: string, tin = 0, tout = 0) =>
  writeFileSync(join(dir, '.orch', 'runs.jsonl'), JSON.stringify({ ts: new Date(now - min * 60_000).toISOString(), task, vendor, event, tokensIn: tin, tokensOut: tout }) + '\n', { flag: 'a' });
run(120, 'T-001', 'claude', 'start'); run(118, 'T-001', 'claude', 'end · done', 41_000, 900);
run(110, 'T-002', 'agy', 'start'); run(105, 'T-002', 'agy', 'end · done', 18_000, 1_100);
run(110, 'T-003', 'agy', 'start'); run(104, 'T-003', 'agy', 'question');
run(100, 'T-004', 'ollama', 'start'); run(98, 'T-004', 'ollama', 'end · done', 22_400, 900);
run(30, 'T-005', 'codex', 'start'); run(3, 'T-005', 'codex', 'end · done', 55_000, 1_200);
console.log(`demo repo ready: ${dir}`);
