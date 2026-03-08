# Memory

## 2026-03-08

- `codex exec --json` emits machine-readable JSONL that includes `thread.started.thread_id`, `item.completed` entries for agent messages, and `turn.completed.usage`.
- `codex exec resume --json <thread_id> <prompt>` can continue the same Codex session non-interactively.
- When integrating with CLI JSONL output, keep a line buffer across stdout chunks; splitting each data chunk independently can corrupt partial JSON lines.
