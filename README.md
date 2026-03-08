# discord-codex

Minimal Discord bot that proxies `@codex` mentions into the local `codex` CLI.

## What it does

- In a normal Discord channel, a user mentions the bot with a prompt.
- The bot creates a new thread from that message.
- The bot runs `codex exec` with only that message as input.
- The bot posts the answer inside the new thread.
- Later, inside that same thread, the user can mention the bot again.
- The bot resumes the same Codex session with `codex exec resume`.

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
- `CODEX_CWD`: Working directory passed to the local `codex` CLI. Optional. Defaults to `./workspace` and will be created automatically at startup if missing.
- `CODEX_BIN`: Codex executable name or absolute path. Optional. Defaults to `codex`.

## Prompt Syntax

- Default:

```text
@codex explain this code
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

- The bot only reacts when it is explicitly mentioned.
- On each valid mention, the bot first adds a `👀` reaction to the user's message as an immediate acknowledgement.
- In normal channels, only the current message is sent to Codex.
- In threads, the bot only resumes threads it created and recorded in `data/sessions.json`.
- Session state is stored locally in `data/sessions.json`.
- The default Codex working directory is `./workspace`, and the bot creates it automatically if it does not exist.
- Before each answer, the bot posts a short status block in the thread showing whether it started or resumed a Codex session, what Discord context was sent, what `--model` arg was used, and the per-turn usage reported by `codex --json`.
- Attachments are not wired into Codex yet.

If you later want to use a custom server emoji instead of a Unicode emoji, also grant `Use External Emojis` when needed.

## Test

```bash
pnpm test
```
