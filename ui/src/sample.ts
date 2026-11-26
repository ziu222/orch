// Demo data shown when the console is opened without `orch ui` behind it.
import type { UiFile, UiState, UiTask, UiVendor } from './api.ts';

const hist = (seed: number, peak: number) => Array.from({ length: 20 }, (_, i) => Math.round(((Math.sin(i * 1.7 + seed) + 1.2) / 2.2) * peak));

export function sampleState(): UiState {
  const now = Date.now();
  const ago = (m: number) => new Date(now - m * 60_000).toISOString();
  const vendor = (v: Partial<UiVendor> & Pick<UiVendor, 'id' | 'name' | 'code'>): UiVendor => ({
    local: false, maxParallel: 2, running: [], waiting: [], tokens5h: 0, tokensWeek: 0, tokensTotal: 0, hist: hist(1, 3), ...v,
  });
  const task = (t: Partial<UiTask> & Pick<UiTask, 'id' | 'title' | 'vendor' | 'status' | 'role'>): UiTask => ({
    deps: [], writesCode: false, tokensIn: 0, tokensOut: 0, secs: 0, report: null, ...t,
  });
  const ok = (summary: string, files: { path: string; lines?: string }[] = []) => ({ summary, files, verified: true, confidence: 'high' as const });

  const tasks: UiTask[] = [
    task({ id: 'T-009', title: 'Sửa lint', vendor: 'agy', role: 'scout', status: 'failed', tokensIn: 1180, tokensOut: 40, secs: 21, reason: 'rate limited on agy' }),
    task({ id: 'T-011', title: 'Lập kế hoạch', vendor: 'claude', role: 'plan', status: 'done', tokensIn: 1640, tokensOut: 460, secs: 38, verified: true, report: ok('Chia yêu cầu "reset mật khẩu" thành 6 task: khảo sát auth và mail, nén context, viết code, review chéo, verify.') }),
    task({ id: 'T-012', title: 'Khảo sát auth', vendor: 'agy', role: 'scout', status: 'done', deps: ['T-011'], tokensIn: 16900, tokensOut: 1140, secs: 94, verified: true, report: ok('Luồng đăng nhập ở src/auth/login.ts:12–88. Session lưu ở src/auth/session.ts:40. Chưa có bảng token reset.', [{ path: 'src/auth/login.ts', lines: '12-88' }, { path: 'src/auth/session.ts', lines: '40' }]) }),
    task({ id: 'T-013', title: 'Khảo sát gửi mail', vendor: 'agy', role: 'scout', status: 'blocked', deps: ['T-011'], tokensIn: 8200, tokensOut: 610, secs: 51, question: 'Template email reset viết tiếng Việt hay tiếng Anh? Repo có cả emails/vi và emails/en.' }),
    task({ id: 'T-010', title: 'Nén context auth', vendor: 'ollama', role: 'summarize', status: 'done', deps: ['T-011'], tokensIn: 22400, tokensOut: 900, secs: 64, verified: true, report: ok('Nén 22k token code auth còn 900 token tóm tắt cho T-014. Chạy trên máy, không tốn quota hãng.') }),
    task({ id: 'T-014', title: 'Viết reset mật khẩu', vendor: 'codex', role: 'implement', status: 'running', deps: ['T-012', 'T-010'], writesCode: true, worktree: '.orch/worktrees/T-014', tokensIn: 27140, tokensOut: 4020, secs: 192 }),
    task({ id: 'T-015', title: 'Review chéo', vendor: 'claude', role: 'review', status: 'queued', deps: ['T-013', 'T-014'], reviewOf: 'T-014', round: 1 }),
    task({ id: 'T-016', title: 'Verify: chạy test', vendor: 'codex', role: 'verify', status: 'queued', deps: ['T-015'] }),
  ];

  const runs = [
    [24, 'T-011', 'claude', 'end · done', 2100], [22, 'T-012', 'agy', 'start', 0], [22, 'T-013', 'agy', 'start', 0],
    [21, 'T-010', 'ollama', 'start', 0], [20, 'T-010', 'ollama', 'end · done', 23300], [15, 'T-012', 'agy', 'end · done', 18040],
    [14, 'T-014', 'codex', 'start', 0], [5, 'T-009', 'agy', 'end · failed · rate limited', 1220], [4, 'T-013', 'agy', 'question', 0],
  ] as const;

  const files: UiFile[] = [
    { path: 'AGENTS.md', status: 'M', by: [] },
    { path: 'package.json', status: '', by: [] },
    { path: 'src/auth/login.ts', status: 'R', by: [{ task: 'T-012', vendor: 'agy', act: 'đọc dòng 12-88' }, { task: 'T-010', vendor: 'ollama', act: 'đọc để nén context' }] },
    { path: 'src/auth/session.ts', status: 'M', by: [{ task: 'T-012', vendor: 'agy', act: 'đọc dòng 40' }, { task: 'T-014', vendor: 'codex', act: 'sửa trong orch/t-014', delta: '+6 −1' }] },
    { path: 'src/auth/reset.ts', status: 'A', by: [{ task: 'T-014', vendor: 'codex', act: 'tạo mới trong orch/t-014', delta: '+58' }] },
    { path: 'src/routes/auth.ts', status: 'M', by: [{ task: 'T-014', vendor: 'codex', act: 'sửa trong orch/t-014', delta: '+12 −2' }] },
    { path: 'tests/reset.spec.ts', status: 'A', by: [{ task: 'T-014', vendor: 'codex', act: 'tạo mới trong orch/t-014', delta: '+41' }] },
  ];

  return {
    root: 'typing-web (dữ liệu mẫu)',
    now: new Date(now).toISOString(),
    running: false,
    vendors: [
      vendor({ id: 'claude', name: 'Claude Code', code: 'CL', waiting: [{ id: 'T-015', why: 'chờ T-013' }], tokens5h: 96_000, tokensWeek: 410_000, tokensTotal: 480_000, pct5h: 62, pctWeek: 38, hist: hist(2, 14) }),
      vendor({ id: 'codex', name: 'Codex CLI', code: 'CX', running: ['T-014'], waiting: [{ id: 'T-016', why: 'chờ T-015' }], tokens5h: 52_000, tokensWeek: 160_000, tokensTotal: 210_000, pct5h: 41, pctWeek: 22, hist: hist(3, 10) }),
      vendor({ id: 'agy', name: 'Antigravity', code: 'AG', waiting: [{ id: 'T-013', why: 'câu hỏi' }], tokens5h: 19_000, tokensWeek: 61_000, tokensTotal: 61_000, pct5h: 18, hist: hist(4, 6) }),
      vendor({ id: 'copilot', name: 'Copilot CLI', code: 'CP', hist: hist(5, 0) }),
      vendor({ id: 'ollama', name: 'Ollama', code: 'OL', local: true, model: 'qwen3-coder:30b', maxParallel: 1, tokens5h: 23_300, tokensWeek: 23_300, tokensTotal: 23_300, hist: hist(6, 5) }),
    ],
    tasks,
    questions: [{ task: 'T-013', q: tasks[3].question! }],
    runs: runs.map(([m, task, vendorId, event, tokens]) => ({ ts: ago(m), task, vendor: vendorId, event, tokensIn: tokens, tokensOut: 0 })),
    files,
    agentsMd: '# AGENTS.md — luật chung cho mọi agent\n\n- Chỉ làm trong thư mục task hoặc worktree được giao.\n- Không đọc .env, khóa SSH hay token.\n- Chạy test hoặc phép kiểm tra trực tiếp nhất trước khi báo xong.\n- Kẹt thì ghi câu hỏi vào questions, không đoán.\n',
    skills: [
      { name: 'verification-before-completion', path: 'skills/verification-before-completion/SKILL.md', on: { claude: true, codex: true, agy: true, ollama: true } },
      { name: 'code-review', path: 'skills/code-review/SKILL.md', on: { claude: true, codex: true } },
      { name: 'test-driven-development', path: 'skills/test-driven-development/SKILL.md', on: { claude: true, codex: true } },
    ],
    chat: [
      { ts: ago(26), who: 'me', text: 'Thêm chức năng reset mật khẩu cho typing web' },
      { ts: ago(25), who: 'orch', text: 'Đã lập 6 task. T-012 và T-013 Antigravity khảo sát, T-010 Ollama nén context, T-014 Codex viết code trong worktree riêng, T-015 Claude review chéo, T-016 chạy test.' },
      { ts: ago(15), who: 'orch', text: 'T-012 xong. Báo cáo có path và số dòng, planner đã kiểm tra lại.' },
      { ts: ago(4), who: 'orch', text: 'T-013 đang hỏi bạn một câu ở ghi chú lề. T-015 chờ câu trả lời đó.' },
    ],
  };
}

export const SAMPLE_DIFF = [
  '@@ new file src/auth/reset.ts',
  "+import { sendMail } from '../lib/mailer'",
  '+',
  '+export async function requestReset(email: string) {',
  '+  const user = await users.findByEmail(email)',
  '+  if (!user) return // không lộ email có tồn tại hay không',
  '+  const token = randomToken()',
  "+  await sendMail(user.email, 'reset', { token })",
  '+}',
].join('\n');
