# discord-codex

Minimal Discord bot that proxies `@codex` mentions into the local `codex` CLI.

## What it does

- In a normal Discord channel, a user mentions the bot with a prompt.
- The user can attach image files to that mention.
- The bot creates a new thread from that message.
- The bot runs `codex exec` with that message as input, plus any attached images via `-i`.
- The bot posts the answer inside the new thread.
- Later, inside that same thread, the user can mention the bot again.
- The bot resumes the same Codex session with `codex exec resume`, and can also pass newly attached images.

This MVP intentionally does **not** read full channel history, compact old context, or optimize token usage.

## Requirements

- Node.js 22+
- `pnpm`
- A Discord bot token
- A locally installed `codex` CLI that is already logged in
- Discord bot permissions for:
  - View Channels
  - Send Messages
  - Create Public Threads
  - Send Messages in Threads
  - Read Message History
  - Add Reactions
- Discord privileged intent:
  - Message Content Intent

## Setup

1. Install dependencies:

```bash
pnpm install
```

2. Copy `.env.example` to `.env` and fill in the values:

```bash
cp .env.example .env
```

3. Start the bot:

```bash
pnpm start
```

## Environment Variables

- `DISCORD_BOT_TOKEN`: Discord bot token. Required.
- `DISCORD_GUILD_ID`: Optional. If set, slash commands are registered in that guild for faster testing. If unset, slash commands are registered globally.
- `ALLOWED_BOT_IDS`: Optional comma-separated bot user IDs that are allowed to trigger Codex. All other bot-authored messages are ignored.
- `CODEX_CWD`: Working directory passed to the local `codex` CLI. Optional. Defaults to `./workspace` and will be created automatically at startup if missing.
- `CODEX_BIN`: Codex executable name or absolute path. Optional. Defaults to `codex`.
- `HTTP_PROXY` / `HTTPS_PROXY` / `ALL_PROXY` / `NO_PROXY`: Optional explicit proxy env vars. If these are unset on macOS, the bot will try to read the current system proxy from `scutil --proxy` at startup.

## Prompt Syntax

- Default:

```text
@codex explain this code
```

- With an attached image:

```text
@codex what is in this image?
```

- Specify a model for just this request:

```text
@codex --model gpt-5 explain this code
```

```text
@codex -m gpt-5 explain this code
```

If no model is specified, the bot does not pass `-m` to the CLI, so Codex uses its own normal default/config behavior.

## Behavior Notes

- The bot reacts to any Discord mention in the message.
- By default, bot-authored messages are ignored. If a bot author is listed in `ALLOWED_BOT_IDS`, it follows the same trigger rule as a human-authored message.
- Slash commands `/help` and `/status` are handled locally by the bot and do not call Codex.
- On each valid mention, the bot first adds a `👀` reaction to the user's message as an immediate acknowledgement.
- While Codex is working, the bot keeps the Discord typing indicator active in the thread instead of posting a separate "Running Codex..." placeholder message.
- When Codex finishes, the first result message in the thread `@` mentions the requester so they get a completion ping.
- In normal channels, only the current message is sent to Codex.
- Any image attachments on the mention are downloaded temporarily and passed to Codex with `-i`.
- In threads, the bot only resumes threads it created and recorded in `data/sessions.json`.
- Session state is stored locally in `data/sessions.json`.
- The default Codex working directory is `./workspace`, and the bot creates it automatically if it does not exist.
- Before each answer, the bot posts a short status block in the thread showing whether it started or resumed a Codex session, what Discord context was sent, how many images were attached, what `--model` arg was used, and the per-turn usage reported by `codex --json`.
- When the Codex CLI fails, the bot now prefers the most useful surfaced CLI error text (for example account usage-limit errors) instead of only echoing an internal wrapper warning.
- On macOS, if no explicit proxy env vars are set, the bot auto-detects the current system proxy and applies it to Discord REST, the Discord gateway connection, attachment downloads, and inherited child-process env vars. SOCKS-only system proxy setups may still need explicit `HTTP_PROXY` / `HTTPS_PROXY` env vars for Discord traffic.

If you later want to use a custom server emoji instead of a Unicode emoji, also grant `Use External Emojis` when needed.

Typing indicators do not need extra Discord privileges beyond the existing send-message permissions used by the bot.

`/status` uses two zero-token local sources:
- the latest local Codex `token_count` event from `~/.codex/sessions/*.jsonl`
- if the newest usage event has no rate-limit snapshot, the most recent non-null local Codex rate-limit snapshot is used as a fallback
- this bot's own persisted runtime stats in `data/sessions.json`

For slash commands, invite the app with the `applications.commands` scope in addition to the normal `bot` scope. If you are testing in one server, setting `DISCORD_GUILD_ID` makes command registration much faster than waiting for global propagation.

## Test

```bash
pnpm test
```
