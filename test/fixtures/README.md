# Fixtures

Real captures:
- claude-ok.json: `claude -p "Reply with: ok" --output-format json`, Claude Code 2.1.304, 2026-11-26.
- codex-auth-error.jsonl: `codex exec --json --skip-git-repo-check "Reply with: ok"`, codex-cli 0.154.0, 2026-11-26, while the login had expired (exit 1).

Synthesized (replace with real captures when available):
- claude-ratelimit.json / .txt: from the shape of claude-ok.json and observed limit messages.
- codex-ok.jsonl, codex-ratelimit.jsonl: codex-cli 0.154.0 `exec --json` event shapes (thread/turn/item events, usage on turn.completed). Re-capture after `codex login`.
- gemini-ok.json, gemini-error.json: Gemini CLI `-p --output-format json` shape (response, stats.models.*.tokens, error). Gemini CLI is not installed on the capture machine.
