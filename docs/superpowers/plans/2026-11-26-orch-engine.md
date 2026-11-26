# orch Engine + CLI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A local `orch` CLI that turns one request into a task DAG, runs each task on an official vendor CLI (Claude Code, Codex, Gemini CLI) or local Ollama, passes results between tasks through files, and enforces the account-safety rules.

**Architecture:** Node + TypeScript run directly by Node's built-in type stripping (no build step). One engine process schedules tasks from `.orch/tasks/<id>/`, spawns one headless CLI per task through a small adapter per vendor, and records every event in `.orch/runs.jsonl`. Agents never talk to each other; the engine moves data between task folders (handoff, questions, review rounds).

**Tech Stack:** Node ≥ 23.6 (machine has 26.8.1), TypeScript syntax via type stripping, `node:test` + `node:assert`, `node:child_process`, `node:util` `parseArgs`, git worktree. Zero runtime dependencies.

**Spec:** "Spec: orch — Multi-agent CLI Orchestrator", https://claude.ai/artifact/LypqPompS5H3qYu4sh68vE (sections Adapter CLI và an toàn tài khoản, Harness, Giao tiếp giữa agent, Theo dõi usage, Lộ trình tuần 1–3). The web UI (`orch ui`, tuần 4–5) is a separate plan that reads the files this plan writes.

## Global Constraints

- Only official vendor binaries are spawned; never read, copy or send a CLI's login token.
- One account per vendor; no account rotation.
- `max_parallel` defaults: claude 2, codex 2, gemini 2, ollama 1. Over the limit → queue, never spawn more.
- Rate limit or quota message → pause that vendor until its reset time, no retry burst; move the task to the role's fallback vendor if one is configured, else leave it `blocked`.
- No 24/7 loop: the engine runs only for a request and exits when every task is terminal or blocked.
- A `report.json` with `verified: false` is never accepted as done.
- Review is cross-vendor: reviewer vendor ≠ the vendor that wrote the code. Max 2 review rounds, then stop and ask the user.
- Every code-writing task runs in its own git worktree; merging into the main branch happens only on `orch merge <task>` typed by the user.
- Usage numbers not reported by a vendor are labelled `estimated`.
- Config file is `.orch/config.json` (plain JSON; the spec's `.jsonc` dropped to avoid a comment parser).
- Windows is the primary platform: spawn through `shell: true` on win32 (npm CLIs are `.cmd` shims) and never put user text on the command line; the prompt lives in `task.md`.

## Review Focus

- Vendor CLI not installed or not logged in → that task fails with "claude not found / not logged in", the rest of the DAG keeps running. Test in Task 5.
- Worker exits 0 but writes no `report.json`, or invalid JSON → task `failed`, never `done`. Test in Task 5.
- Planner returns a DAG with a cycle or an unknown dependency id → plan rejected before any task runs. Test in Task 6.
- Rate limit hits while other tasks of that vendor are queued → those tasks move to the fallback vendor or wait; none is spawned on the paused vendor. Test in Task 6.
- Ctrl+C during `orch run` → child processes killed, running tasks written as `cancelled`, not left `running`. Test in Task 9.

---

## File Structure

```
package.json                 bin: orch → src/cli.ts; scripts.test
src/cli.ts                   argv → commands (init, run, status, stats, answer, merge)
src/types.ts                 Task, Report, RunEvent, Config, Vendor, AdapterResult
src/config.ts                loadConfig / defaultConfig
src/store.ts                 everything under .orch/ (tasks, reports, runs.jsonl, questions.jsonl)
src/adapters/index.ts        adapter registry: getAdapter(vendor)
src/adapters/claude.ts       build args + parse `claude -p --output-format json`
src/adapters/codex.ts        build args + parse `codex exec --json` (JSONL)
src/adapters/gemini.ts       build args + parse `gemini -p --output-format json`
src/adapters/ollama.ts       HTTP to localhost:11434/api/chat (no spawn)
src/runner.ts                run one task: spawn/call, output.log, read + validate report
src/engine.ts                scheduler: DAG, limits, pause, handoff, questions, review rounds
src/worktree.ts              git worktree add / merge / remove
src/planner.ts               request → plan.json via the planner vendor → tasks
templates/AGENTS.md          shared process copied by `orch init`
templates/worker-prompt.md   instructions every worker gets (report.json contract)
test/*.test.ts               one test file per src file
test/fixtures/*              real CLI outputs captured in Task 2–3
```

---

### Task 1: Scaffold, types, config, store, `orch init`

**Files:**
- Create: `package.json`, `src/types.ts`, `src/config.ts`, `src/store.ts`, `src/cli.ts`, `templates/AGENTS.md`, `templates/worker-prompt.md`, `.gitignore`
- Test: `test/store.test.ts`, `test/config.test.ts`

**Interfaces:**
- Produces (in `src/types.ts`):
  - `type Vendor = 'claude' | 'codex' | 'gemini' | 'ollama'`
  - `type TaskStatus = 'queued' | 'running' | 'review' | 'done' | 'failed' | 'blocked' | 'cancelled'`
  - `type Role = 'plan' | 'scout' | 'implement' | 'review' | 'verify' | 'summarize'`
  - `interface Task { id: string; title: string; role: Role; vendor: Vendor; deps: string[]; status: TaskStatus; writesCode: boolean; reviewOf?: string; round?: number; worktree?: string }`
  - `interface Report { summary: string; files: { path: string; lines?: string }[]; verified: boolean; confidence: 'low' | 'med' | 'high'; questions?: string[]; findings?: string[] }`
  - `interface RunEvent { ts: string; task: string; vendor: Vendor; event: string; tokensIn: number; tokensOut: number; estimated?: boolean }`
  - `interface VendorConfig { maxParallel: number; model?: string; pausedUntil?: string }`
  - `interface Config { vendors: Record<Vendor, VendorConfig>; roles: Record<Role, { vendor: Vendor; fallback?: Vendor }>; maxReviewRounds: number; taskTimeoutSec: number }`
- Produces (in `src/config.ts`): `defaultConfig(): Config`, `loadConfig(root: string): Config` (merges file over defaults), `saveConfig(root: string, c: Config): void`
- Produces (in `src/store.ts`), all paths under `<root>/.orch/`:
  - `createTask(root, t: Omit<Task,'status'>, taskMd: string, contextMd?: string): Task` → writes `tasks/<id>/task.json`, `task.md`, `context.md`, status `queued`
  - `readTask(root, id): Task`, `listTasks(root): Task[]` (sorted by id), `setStatus(root, id, s: TaskStatus, extra?: Partial<Task>): Task`
  - `taskDir(root, id): string`, `readReport(root, id): Report | null` (null when missing or invalid JSON)
  - `appendContext(root, id, text: string): void`
  - `appendRun(root, e: Omit<RunEvent,'ts'>): void`, `readRuns(root): RunEvent[]`
  - `appendQuestion(root, id, q: string): void`, `answerQuestion(root, id, a: string): void`, `readQuestions(root, id): { q: string; a?: string }[]` (file `tasks/<id>/questions.jsonl`)
  - `nextTaskId(root): string` → `T-001`, `T-002`, …

Defaults pinned by the spec: `maxParallel` claude 2 / codex 2 / gemini 2 / ollama 1; ollama model `qwen3-coder:30b`; roles `plan→claude`, `scout→gemini (fallback codex)`, `implement→codex (fallback claude)`, `review→claude (fallback codex)`, `verify→codex`, `summarize→ollama (fallback gemini)`; `maxReviewRounds` 2; `taskTimeoutSec` 1800.

- [ ] **Step 1: `git init`, write `package.json`** with `"type": "module"`, `"bin": { "orch": "src/cli.ts" }`, `"scripts": { "test": "node --test test/" }`, `"engines": { "node": ">=23.6" }`. `.gitignore`: `node_modules/`, `.orch/`.

- [ ] **Step 2: Write the failing tests**

```ts
// test/store.test.ts
test('createTask writes queued task and ids increment', () => {
  const root = tmpRoot();
  const id = nextTaskId(root);                       // 'T-001'
  createTask(root, { id, title: 'Scout auth', role: 'scout', vendor: 'gemini', deps: [], writesCode: false }, '# do it');
  assert.equal(readTask(root, id).status, 'queued');
  assert.equal(nextTaskId(root), 'T-002');
});
test('readReport returns null for missing or broken report.json', () => {
  const root = tmpRoot(); /* create T-001 */ 
  assert.equal(readReport(root, 'T-001'), null);
  writeFileSync(join(taskDir(root, 'T-001'), 'report.json'), '{oops');
  assert.equal(readReport(root, 'T-001'), null);
});
test('runs.jsonl appends and reads back in order', () => { /* two appendRun → readRuns length 2, ts is ISO */ });
test('questions round-trip', () => { /* appendQuestion then answerQuestion → [{q, a}] */ });
// test/config.test.ts
test('defaults and file override', () => {
  assert.equal(defaultConfig().vendors.ollama.maxParallel, 1);
  // write .orch/config.json with vendors.claude.maxParallel = 1 → loadConfig gives 1, codex still 2
});
```

- [ ] **Step 3: Run** `npm test` → FAIL (modules missing).
- [ ] **Step 4: Implement** `types.ts`, `config.ts`, `store.ts` with `node:fs` sync calls (deep-merge config per vendor/role key).
- [ ] **Step 5: Implement `orch init`** in `src/cli.ts` (`#!/usr/bin/env node`, `parseArgs`): creates `.orch/`, writes `config.json` from defaults, copies `templates/AGENTS.md` to repo root if absent. `templates/AGENTS.md` holds the shared rules (report contract, verify before done, never read `.env`/keys, stay inside the task folder or worktree) and points to the pstack `SKILL.md` files the user keeps in `skills/` (verification and review first, per the spec); `init` does not download pstack. `templates/worker-prompt.md` holds the per-task instructions with placeholders `{{taskDir}}`, `{{id}}` and the exact `Report` JSON shape.
- [ ] **Step 6: Run** `npm test` → PASS; `node src/cli.ts init` in a temp dir creates `.orch/config.json`.
- [ ] **Step 7: Commit** `feat: scaffold orch store, config and init`

---

### Task 2: Adapter contract + Claude adapter

**Files:**
- Create: `src/adapters/index.ts`, `src/adapters/claude.ts`, `test/fixtures/claude-ok.json`, `test/fixtures/claude-ratelimit.txt`
- Test: `test/adapters.test.ts`

**Interfaces:**
- Produces (add to `src/types.ts`):
  - `interface AdapterResult { text: string; tokensIn: number; tokensOut: number; estimated?: boolean; rateLimited: boolean; resetAt?: string; error?: string }`
  - `interface SpawnAdapter { kind: 'spawn'; bin: string; args(promptFile: string, model?: string): string[]; parse(stdout: string, stderr: string, code: number): AdapterResult }`
  - `interface HttpAdapter { kind: 'http'; call(prompt: string, model: string, signal: AbortSignal): Promise<AdapterResult> }`
  - `type Adapter = SpawnAdapter | HttpAdapter`
- Produces: `getAdapter(v: Vendor): Adapter` in `src/adapters/index.ts`; shared `isRateLimit(text: string): boolean` matching `/rate.?limit|usage limit|quota|429|too many requests/i`.

The CLI argument is always the short instruction `Read <promptFile> and follow it.`, never user text.

- [ ] **Step 1: Capture a real fixture.** Run `claude -p "Reply with: ok" --output-format json > test/fixtures/claude-ok.json` and check it contains `result` and `usage.input_tokens` / `usage.output_tokens`. Write `claude-ratelimit.txt` from a real or documented limit message (one line).
- [ ] **Step 2: Write the failing tests**

```ts
test('claude parse reads text and tokens from fixture', () => {
  const r = getAdapter('claude').parse(read('claude-ok.json'), '', 0);
  assert.match(r.text, /ok/i);
  assert.ok(r.tokensIn > 0 && r.tokensOut > 0);
  assert.equal(r.rateLimited, false);
});
test('claude parse flags rate limit from stderr', () => {
  assert.equal(getAdapter('claude').parse('', read('claude-ratelimit.txt'), 1).rateLimited, true);
});
test('claude args never contain the prompt text', () => {
  const a = getAdapter('claude') as SpawnAdapter;
  assert.deepEqual(a.args('.orch/tasks/T-001/prompt.md').slice(0, 1), ['-p']);
  assert.ok(a.args('x').includes('--output-format') && a.args('x').includes('json'));
});
test('claude parse on non-JSON stdout returns error, not throw', () => { /* parse('garbage','',1).error is set */ });
```

- [ ] **Step 3: Run** `node --test test/adapters.test.ts` → FAIL.
- [ ] **Step 4: Implement** `claude.ts`: `bin 'claude'`, args `['-p', 'Read <file> and follow it.', '--output-format', 'json', '--permission-mode', 'acceptEdits']`, parse JSON (`result`, `usage`, `is_error`).
- [ ] **Step 5: Run** → PASS.
- [ ] **Step 6: Commit** `feat: adapter contract and claude adapter`

---

### Task 3: Codex and Gemini adapters

**Files:**
- Create: `src/adapters/codex.ts`, `src/adapters/gemini.ts`, `test/fixtures/codex-ok.jsonl`, `test/fixtures/gemini-ok.json`
- Test: `test/adapters.test.ts` (extend)

**Interfaces:**
- Consumes: `SpawnAdapter`, `isRateLimit` from Task 2.
- Produces: `getAdapter('codex')`, `getAdapter('gemini')`.

- [ ] **Step 1: Capture fixtures:** `codex exec --json "Reply with: ok" > test/fixtures/codex-ok.jsonl`; `gemini -p "Reply with: ok" --output-format json > test/fixtures/gemini-ok.json`. Note in a comment at the top of each adapter the CLI version used (`codex --version`, `gemini --version`); the spec requires recording tested versions.
- [ ] **Step 2: Write failing tests** mirroring Task 2 for each vendor: text matches `/ok/i`, tokens > 0 when the fixture has usage (if a vendor's output has no token counts, assert `tokensIn === 0` and `estimated === true`, which the runner copies onto the `RunEvent`), rate limit flagged, garbage input returns `error`.
- [ ] **Step 3: Run** → FAIL.
- [ ] **Step 4: Implement.** Codex: bin `codex`, args `['exec', '--json', '--full-auto', 'Read <file> and follow it.']`; parse each JSONL line, last agent message = text, sum usage fields found. Gemini: bin `gemini`, args `['-p', 'Read <file> and follow it.', '--output-format', 'json', '--yolo']`; text from `response`, tokens summed across `stats.models.*.tokens`. Adjust field names to what the fixtures actually contain.
- [ ] **Step 5: Run** → PASS.
- [ ] **Step 6: Commit** `feat: codex and gemini adapters`

---

### Task 4: Ollama adapter (HTTP)

**Files:**
- Create: `src/adapters/ollama.ts`
- Test: `test/ollama.test.ts`

**Interfaces:**
- Produces: `getAdapter('ollama')` as `HttpAdapter`; base URL from env `OLLAMA_HOST` or `http://localhost:11434`.

- [ ] **Step 1: Write failing tests** with a local `node:http` server standing in for Ollama:

```ts
test('ollama call maps eval counts to tokens', async () => {
  // fake server answers POST /api/chat with
  // { message: { content: 'ok' }, prompt_eval_count: 12, eval_count: 3, done: true }
  const r = await adapter.call('hi', 'qwen3-coder:30b', AbortSignal.timeout(5000));
  assert.deepEqual([r.text, r.tokensIn, r.tokensOut, r.rateLimited], ['ok', 12, 3, false]);
});
test('ollama down → error "Ollama not running at <url>"', async () => { /* point at closed port */ });
test('unknown model (404) → error names the model and suggests `ollama pull`', async () => {});
```

- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** with global `fetch`, `stream: false`, `options.num_ctx` 8192.
- [ ] **Step 4: Run** → PASS. Manual check against the real server: `node -e` one call to `qwen2.5-coder:7b` returns text.
- [ ] **Step 5: Commit** `feat: ollama http adapter`

Note: Ollama workers cannot edit files through this adapter; roles that write code never route to `ollama` (enforced in Task 6).

---

### Task 5: Runner — execute one task

**Files:**
- Create: `src/runner.ts`
- Test: `test/runner.test.ts`, `test/fixtures/fake-cli.mjs`

**Interfaces:**
- Consumes: store (Task 1), `getAdapter` (Tasks 2–4), `templates/worker-prompt.md`.
- Produces: `runTask(root: string, task: Task, cfg: Config, signal: AbortSignal, cwd?: string): Promise<RunOutcome>`
  - `type RunOutcome = { status: 'done' | 'failed' | 'blocked' | 'cancelled' | 'ratelimited'; report: Report | null; result: AdapterResult; reason?: string }`
  - Writes `tasks/<id>/prompt.md` (worker-prompt + task.md + context.md), `output.log` (stdout+stderr), appends `RunEvent`s `start` and `end` with tokens.
  - For spawn adapters the worker must write `report.json`; for http adapters the runner asks the model to answer with the Report JSON and writes `report.json` itself.
- Test seam: `runTask` resolves the binary through `process.env.ORCH_BIN_<VENDOR>` when set, so tests point `claude` at `node test/fixtures/fake-cli.mjs <mode>`.

Outcome rules (spec): report missing/invalid → `failed` reason `no valid report.json`; `verified: false` → `failed` reason `report not verified`; `questions` non-empty → `blocked`; adapter `rateLimited` → `ratelimited`; binary missing (ENOENT or exit 9009 / "not recognized" on win32) → `failed` reason `<bin> not found or not logged in`; timeout `taskTimeoutSec` or abort → kill the child tree (`taskkill /T /F /PID` on win32, `process.kill(-pid)` elsewhere) → `cancelled`.

- [ ] **Step 1: Write `fake-cli.mjs`** with modes `ok` (writes a verified report.json into cwd task dir, prints claude-style JSON), `noreport`, `unverified`, `question`, `ratelimit`, `hang`.
- [ ] **Step 2: Write failing tests**, one per mode, asserting the outcome status and reason above, plus:

```ts
test('missing binary fails only this task with a clear reason', async () => {
  process.env.ORCH_BIN_CLAUDE = 'definitely-not-a-cli-xyz';
  const o = await runTask(root, task, cfg, AbortSignal.timeout(10000));
  assert.equal(o.status, 'failed');
  assert.match(o.reason!, /not found or not logged in/);
});
test('hang is cancelled on abort and child is gone', async () => { /* abort after 300ms → cancelled; pid no longer alive */ });
test('output.log and start/end run events are written', async () => {});
```

- [ ] **Step 3: Run** → FAIL.
- [ ] **Step 4: Implement** `runTask` (`spawn(bin, args, { cwd, shell: process.platform === 'win32' })`).
- [ ] **Step 5: Run** → PASS.
- [ ] **Step 6: Commit** `feat: task runner with report validation`

---

### Task 6: Engine scheduler

**Files:**
- Create: `src/engine.ts`
- Test: `test/engine.test.ts`

**Interfaces:**
- Consumes: store, config, `runTask`.
- Produces:
  - `validateDag(tasks: Pick<Task,'id'|'deps'>[]): string | null` → error text for a cycle (`cycle: T-002 → T-003 → T-002`) or unknown dep (`T-004 depends on missing T-009`), else null.
  - `runEngine(root: string, opts?: { signal?: AbortSignal; run?: typeof runTask; now?: () => Date }): Promise<{ done: number; failed: number; blocked: number }>`; `run` is the test seam.
- Behaviour:
  - Ready = `queued` and every dep `done`. Start ready tasks while `running(vendor) < maxParallel` and vendor not paused (`pausedUntil` > now).
  - Before starting, append each dep's `report.summary` + `files` to the task's `context.md` (handoff).
  - `ratelimited` → set `vendors[v].pausedUntil` = `result.resetAt` or now + 5 h, save config, append `RunEvent` `paused`; move every `queued` task of that vendor to its role fallback (if fallback is not paused), else leave queued; the engine exits when only paused-vendor tasks remain, printing their resume time.
  - Never assign `writesCode` tasks to `ollama`.
  - A task whose dep ended `failed`/`cancelled` becomes `blocked` with reason `dependency T-xxx failed`.
  - Loop ends when nothing is running and nothing is ready.

- [ ] **Step 1: Write failing tests** with a fake `run` that resolves outcomes from a table:

```ts
test('runs in dependency order', async () => { /* A → B → C: start order A,B,C */ });
test('respects maxParallel per vendor', async () => { /* 4 independent codex tasks, max 2 → never >2 concurrent */ });
test('cycle and unknown dep are rejected', () => {
  assert.match(validateDag([{id:'T-1',deps:['T-2']},{id:'T-2',deps:['T-1']}])!, /cycle/);
  assert.match(validateDag([{id:'T-1',deps:['T-9']}])!, /missing T-9/);
});
test('rate limit pauses vendor and reroutes queued tasks to fallback', async () => {
  // gemini task 1 → ratelimited; gemini tasks 2,3 queued with role scout (fallback codex)
  // expect: no further gemini start; tasks 2,3 run on codex; config.vendors.gemini.pausedUntil set
});
test('failed dependency blocks dependants', async () => {});
test('handoff appends dep summary to context.md', async () => {});
```

- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** `validateDag` (DFS with colour marks) and `runEngine` (promise pool keyed by vendor).
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat: dag engine with limits, pause and handoff`

---

### Task 7: Agent communication — questions and review rounds

**Files:**
- Modify: `src/engine.ts`, `src/cli.ts`
- Test: `test/engine.test.ts` (extend), `test/cli.test.ts`

**Interfaces:**
- Consumes: `appendQuestion`, `answerQuestion`, `readQuestions`, `appendContext` (Task 1), engine (Task 6).
- Produces: CLI `orch answer <taskId> "<text>"`; engine handling of `blocked` with questions and of review `findings`.
- Rules (spec section Giao tiếp giữa agent):
  - Outcome `blocked` with `report.questions` → each question appended to `questions.jsonl`, task `blocked`, RunEvent `question`.
  - `orch answer` → `answerQuestion`, `appendContext(id, "Answer from user: …")`, status back to `queued`. Re-running `orch run --resume` (Task 9) picks it up.
  - Review task (`role 'review'`, `reviewOf: <implId>`) ends `done` with non-empty `findings` and `round < maxReviewRounds` → create fix task (`role 'implement'`, same vendor as `<implId>`, deps `[reviewId]`, `writesCode`, same `worktree`, context = findings) and a new review task (deps `[fixId]`, `round + 1`, reviewer vendor ≠ impl vendor).
  - `round === maxReviewRounds` with findings → review task `blocked`, question `Review still has findings after 2 rounds: … Merge anyway, or give direction?`.
  - Creating a review whose vendor equals the reviewed task's vendor throws `cross-vendor review required`.

- [ ] **Step 1: Write failing tests**

```ts
test('worker question blocks task and answer requeues it', async () => {
  // fake run returns blocked + questions ['Which mailer?']
  // expect status blocked, readQuestions → [{q:'Which mailer?'}]
  // cli answer T-001 "nodemailer" → status queued, context.md contains 'nodemailer'
});
test('review findings spawn fix + re-review, capped at 2 rounds', async () => {
  // review always returns findings → tasks created: fix1, review2, fix2? no: round 2 review → blocked with question
  // assert exactly 2 review tasks exist and the last is blocked
});
test('same-vendor review is refused', () => { /* assert.throws(..., /cross-vendor review required/) */ });
```

- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** in `engine.ts` (outcome handler) and `cli.ts` (`answer` command).
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat: worker questions and capped cross-vendor review rounds`

---

### Task 8: Worktrees and `orch merge`

**Files:**
- Create: `src/worktree.ts`
- Modify: `src/engine.ts` (create worktree before a `writesCode` task starts; pass it as `cwd` to `runTask`), `src/cli.ts` (`merge`)
- Test: `test/worktree.test.ts`

**Interfaces:**
- Produces: `ensureWorktree(repo: string, taskId: string): string` → path `<repo>/.orch/worktrees/<id>`, branch `orch/<id-lowercase>` from current HEAD (reuses an existing one, so fix tasks share the implementer's worktree); `mergeWorktree(repo, taskId): { merged: boolean; message: string }` (refuses unless the task and its latest review are `done` and the verify task, if any, is `done`); `removeWorktree(repo, taskId): void`.
- Gitignored files (`.env` etc.) are not present in a fresh worktree; do not copy them.

- [ ] **Step 1: Write failing tests** in a temp git repo: worktree created on branch `orch/t-001`; a file changed there does not appear in the main checkout; `mergeWorktree` refuses while review is `queued` (message names the missing step) and merges after it is `done`; a fresh worktree has no `.env` even though the main checkout has one.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** with `execFileSync('git', [...])`.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat: per-task worktrees and user-triggered merge`

---

### Task 9: Planner, `orch run`, `status`, `stats`, Ctrl+C

**Files:**
- Create: `src/planner.ts`
- Modify: `src/cli.ts`
- Test: `test/planner.test.ts`, `test/cli.test.ts` (extend)

**Interfaces:**
- Consumes: everything above.
- Produces:
  - `planRequest(root: string, request: string, run?: typeof runTask): Promise<Task[]>` → creates planner task `T-xxx` (role `plan`), its report must contain a fenced ```json block `{ "tasks": [{ "key": "scout-auth", "title", "role", "deps": ["key"], "writesCode": bool, "brief": "…" }] }`; keys are mapped to new ids, vendors come from `cfg.roles`, `validateDag` runs before any task is created; invalid plan → throws with the validator message and no tasks written.
  - CLI:
    - `orch run "<request>"` → plan then `runEngine`; `orch run --resume` → `runEngine` only; `orch run --agent <vendor> "<prompt>"` → single task, no planner (spec tuần 1).
    - `orch status` → one line per task: `T-003  running  gemini  Scout mail` plus open questions.
    - `orch stats` → per vendor: tasks, tokens in/out (sum of runs.jsonl), `estimated` marker, paused-until.
  - SIGINT: an `AbortController` passed to `runEngine`; on Ctrl+C abort, wait for children to die, mark running tasks `cancelled`, exit code 130.

- [ ] **Step 1: Write failing tests**

```ts
test('planner output becomes tasks with mapped deps and role vendors', async () => {
  // fake run returns a plan with scout → implement → review
  // assert 3 tasks, implement.deps = [scout id], review.vendor !== implement.vendor
});
test('cyclic plan writes no tasks', async () => { /* rejects /cycle/, listTasks(root) only has the planner task */ });
test('stats sums tokens per vendor and marks estimated', () => {});
test('SIGINT cancels running tasks and exits 130', async () => {
  // spawn `node src/cli.ts run --agent claude "x"` with ORCH_BIN_CLAUDE=fake-cli hang,
  // send SIGINT (on win32: child.kill()), expect exit 130 and task status cancelled
});
```

- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** `planner.ts` and the CLI commands.
- [ ] **Step 4: Run** `npm test` → all PASS.
- [ ] **Step 5: End-to-end check on a real repo** (spec tuần 3 "xong khi"): in a throwaway git repo run `orch init`, then `orch run "Add a /health route that returns ok, with a test"`. Expected: planner task done, scout on gemini, implement on codex in `.orch/worktrees/T-00x`, review on claude, verify task runs the test; `orch status` shows all `done`; `orch merge <implement id>` merges. Record the token totals from `orch stats`.
- [ ] **Step 6: Commit** `feat: planner, run/status/stats commands and clean cancel`

---

## Not in this plan

- `orch ui` (React + Vite console) — next plan; it only reads `.orch/` files written here.
- Estimated % of the 5-hour / weekly windows per vendor — computed by the UI plan from `runs.jsonl` token sums; `orch stats` here reports raw tokens only.
- `orch ask --agent` for agent-initiated lookups — add after real use shows the need.
- Artifact publishing through a Claude Code worker — needs the headless test listed in the spec first.
- Grok adapter — blocked until an official CLI is confirmed.
