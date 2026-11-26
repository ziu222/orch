# orch

Personal multi-agent orchestrator: one CLI and a local web console that drive Claude Code, Codex CLI, Antigravity (`agy`), GitHub Copilot CLI and local Ollama models through your existing subscriptions. Task dependency graph, token usage per vendor, account-safe rate caps, cross-vendor code review.

## Use

Needs Node 23.6+ (it runs the TypeScript sources directly) and the vendor CLIs you want to use, already logged in.

```
node src/cli.ts init                 # in your repo: .orch/config.json + AGENTS.md
node src/cli.ts run "add a /health route with a test"
node src/cli.ts status
node src/cli.ts answer T-003 "use nodemailer"
node src/cli.ts merge T-005          # merge a verified task's worktree branch
```

Code-writing tasks run in their own git worktree (`.orch/worktrees/<id>`, branch `orch/<id>`); orch commits the worker's changes and you merge when review and verify are done.

## Console

```
npm run ui:install   # once: React + Vite for the console
npm run ui:build
npm run ui           # serves http://127.0.0.1:4173 for the repo you run it in
```

The console reads `.orch/` and the git worktrees: vendors with their queue and token windows, the task graph, questions waiting for you, the file tree with who touched what, the rules (`AGENTS.md`) and skills every agent receives, usage and the run log. It binds to loopback only; the API needs a token that only the page orch serves can read.

Percentages need a budget: set `budget5h` / `budgetWeek` per vendor in `.orch/config.json`. Without one the console shows tokens and does not guess.

Opened without `orch ui` behind it, the console shows built-in sample data. `npm run demo -- <dir>` builds a throwaway repo with realistic state to try it on, and `npm run ui:dev` runs Vite with hot reload against a running `orch ui`.

## Develop

```
npm test             # backend tests (node:test, no dependencies)
npm run ui:build     # type-checks and builds the console
```

Plans live in `docs/superpowers/plans/`. `orch-ui.html` is the original single-file prototype of the console, kept as a design reference.
