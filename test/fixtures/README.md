# Fixtures

Real captures:
- claude-ok.json: `claude -p "Reply with: ok" --output-format json`, Claude Code 2.1.304, 2026-11-26.
- codex-auth-error.jsonl: `codex exec --json --skip-git-repo-check "Reply with: ok"`, codex-cli 0.154.0, 2026-11-26, while the login had expired (exit 1).
- agy-ok.json: `agy -p "Reply with: ok" --output-format json`, Antigravity CLI 1.5.18, 2026-11-27.
- copilot-ok.jsonl: `copilot -p "Reply with: ok" --output-format json --no-ask-user`, GitHub Copilot CLI 1.0.116, 2026-11-27 (MCP tool-schema lines trimmed).

Synthesized (replace with real captures when available):
- claude-ratelimit.json / .txt: from the shape of claude-ok.json and observed limit messages.
- codex-ok.jsonl, codex-ratelimit.jsonl: codex-cli 0.154.0 `exec --json` event shapes (thread/turn/item events, usage on turn.completed). Re-capture after `codex login`.
- agy-error.json: rate-limit / error shape matching agy-ok.json.
- copilot-error.jsonl: rate-limit / error event shape matching copilot-ok.jsonl.
