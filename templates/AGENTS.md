# AGENTS.md — shared rules for every agent orch runs

These rules apply to Claude Code, Codex CLI, Antigravity CLI, GitHub Copilot CLI and local Ollama models alike.

## Scope
- Work only inside the task folder `.orch/tasks/<id>/` and, for code tasks, the worktree orch gives you.
- Never read secrets: `.env` files, SSH keys, credential or token files. The task folder is always yours to read and write.
- Do not start other agents or long-running processes.

## Finishing a task
- Run the project's tests or verify command before you say you are done. If the project has none, run the most direct check you can (build, lint, run the code, or re-read your output against the task) and say what it was.
- Write `report.json` in the task folder (shape in the task prompt). Set `"verified": true` only if you ran a check and it passed.
- List every file you read or changed in `files`, with line ranges where useful.

## When stuck
- Put your questions in `"questions"` in `report.json` and stop. Do not guess.

## Skills
- Use the skills in `skills/` when a task matches a skill's description (verification and code review first).
