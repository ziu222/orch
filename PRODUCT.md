# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

React + Vite, served locally by the CLI (`orch ui` → localhost). May be wrapped with Tauri later. Prototype is a single-file HTML artifact.

## Users

One developer (the owner), running everything locally on their own machine with their own Claude, ChatGPT/Codex, Gemini and Grok subscriptions. Used on a wide screen beside the IDE, often in the evening in a dark room, occasionally glanced at on a phone to check tasks and usage.

## Product Purpose

A local multi-agent orchestrator ("orch") that drives official vendor CLIs headless (Claude Code, Codex CLI, Gemini CLI, Grok if an official CLI exists) so the token load is spread across several subscriptions instead of exhausting one. Success: real coding tasks finish through a planner → workers → cross-vendor review → verify flow, and Claude's 5-hour / weekly quota lasts noticeably longer.

## Positioning

Unlike single-vendor agent UIs, orch treats each vendor subscription as a worker pool with visible limits, routes tasks across vendors, enforces one shared process (pstack skills + AGENTS.md) for every model, and requires review by a different vendor than the author.

## Operating Context

- Chat box: the owner types a request; it is sent to the CLI/orchestrator, output streams back.
- Task graph (DAG): plan → scouts → implement → review → verify; nodes are clickable for task detail and per-task usage.
- Usage: per provider, 5-hour window and weekly window, read from local CLI logs / JSON output — never from hidden APIs or extracted tokens.
- State is shared through files in `.orch/tasks/<id>/` (task.md, context.md, report.json) and git worktrees.
- Claude Artifacts: publishing works only via Claude Code's own Artifact tool when the account has it; orch passes those requests to a Claude worker and shows the returned link.

## Capabilities and Constraints

- Account safety is a hard constraint: official CLIs only, per-provider concurrency caps (1–2), stop on rate-limit messages, no GUI automation of desktop apps, no OAuth token extraction.
- Grok: official CLI availability unverified (open question).
- Usage numbers for some vendors may be estimates; the UI must label estimated vs reported.

## Evidence on Hand

No real usage data yet; the prototype uses clearly fake sample data.

## Product Principles

1. Account safety over throughput.
2. Show state at a glance; detail on click.
3. One process for every model (pstack), verification before "done".
4. Files are the source of truth; the UI only reads and sends commands.
