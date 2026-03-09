# Memory

## 2026-03-08

- `codex exec --json` emits machine-readable JSONL that includes `thread.started.thread_id`, `item.completed` entries for agent messages, and `turn.completed.usage`.
- `codex exec resume --json <thread_id> <prompt>` can continue the same Codex session non-interactively.
- When integrating with CLI JSONL output, keep a line buffer across stdout chunks; splitting each data chunk independently can corrupt partial JSON lines.

## 2026-03-09

- In modern Node, `http.Agent` / `https.Agent` can be created with `proxyEnv` so libraries that use core `http(s)` without an explicit proxy agent can inherit proxy behavior via the global agents.
- `discord.js` on Node uses `undici` for REST and `ws` for the gateway, so full proxy support may require configuring both an `undici` dispatcher and core `http(s)` agents instead of relying on only one transport hook.
- `codex exec --json` failures do not always put the real user-facing error on stderr; sometimes stderr only has an internal warning while the actionable error is printed on stdout, so wrappers should inspect both.
- Claude Code CLI stream-json integrations should keep a line buffer across stdout chunks and inspect both structured result events and stderr, because session ids, final text, and surfaced errors may arrive in different events.
- Claude Code `--output-format stream-json` in `--print` mode also requires `--verbose`; without it, the CLI can fail before the actual model/backend error is reached.
