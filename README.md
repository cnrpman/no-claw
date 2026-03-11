# discord-codex

Minimal Discord bot bridge for local CLI agents.

It can run:

- a Codex bot that proxies `@codex` mentions into the local `codex` CLI
- a Claude bot that proxies `@claude` mentions into the local Claude Code CLI
- or both at the same time, using separate Discord bot tokens

## What it does

- In a normal Discord channel, a user mentions the bot with a prompt.
- The user can attach image files to that mention.
- The bot creates a new thread from that message.
- The bot runs the matching local CLI (`codex` or `claude`) with that message as input.
- The bot posts the answer inside the new thread.
- Later, inside that same thread, the user can mention the bot again.
- The bot resumes the same backend session, and can also pass newly attached images.

This MVP intentionally does **not** read full channel history, compact old context, or optimize token usage.

## Requirements

- Node.js 22+
- `pnpm`
- One or two Discord bot tokens
- A locally installed `codex` CLI that is already logged in
- Optional: a locally installed Claude Code CLI that is already logged in
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

- `CODEX_DISCORD_BOT_TOKEN`: Optional. Starts the Codex Discord bot.
- `CLAUDE_DISCORD_BOT_TOKEN`: Optional. Starts the Claude Discord bot.
- `DISCORD_BOT_TOKEN`: Optional legacy fallback for the Codex bot only.
- At least one of those bot-token vars must be set, otherwise startup fails immediately.
- `DISCORD_GUILD_ID`: Optional. If set, slash commands are registered in that guild for faster testing. If unset, slash commands are registered globally.
- `ALLOWED_BOT_IDS`: Optional comma-separated bot user IDs that are allowed to trigger a configured bot. All other bot-authored messages are ignored.
- `CODEX_CWD`: Working directory passed to the local `codex` CLI. Optional. Defaults to `./workspace`.
- `CODEX_BIN`: Codex executable name or absolute path. Optional. Defaults to `codex`.
- `CLAUDE_CWD`: Working directory passed to the local Claude CLI. Optional. Defaults to `./workspace`.
- `CLAUDE_BIN`: Claude executable name or absolute path. Optional. Defaults to `claude`.
- `HTTP_PROXY` / `HTTPS_PROXY` / `ALL_PROXY` / `NO_PROXY`: Optional explicit proxy env vars. If these are unset on macOS, the bot will try to read the current system proxy from `scutil --proxy` at startup.

## Prompt Syntax

- Codex:

```text
@codex explain this code
```

- Claude:

```text
@claude explain this code
```

- With an attached image:

```text
@codex what is in this image?
```

```text
@claude what is in this image?
```

- Specify a model for just this request:

```text
@codex --model gpt-5 explain this code
```

```text
@codex -m gpt-5 explain this code
```

```text
@claude --model sonnet explain this code
```

If no model is specified, the bot does not pass a model flag, so the underlying CLI uses its own normal default/config behavior.

## Behavior Notes

- Each bot only reacts when that specific bot user is mentioned. This is required so Codex and Claude bots can coexist in the same server.
- By default, bot-authored messages are ignored. If a bot author is listed in `ALLOWED_BOT_IDS`, it follows the same trigger rule as a human-authored message.
- Slash commands `/help` (both bots) and `/status` (Codex only) are handled locally and do not call the model CLI.
- On each valid mention, the bot first adds a `👀` reaction to the user's message as an immediate acknowledgement.
- While the backend is working, the bot keeps the Discord typing indicator active in the thread instead of posting a separate placeholder message.
- When the backend finishes, the first result message in the thread `@` mentions the requester so they get a completion ping.
- In normal channels, only the current message is sent to the selected backend.
- Any image attachments on the mention are downloaded temporarily and passed to the backend.
- In threads, each bot only resumes threads it created and recorded in its own local session store.
- Session state is stored locally in `data/sessions.json` for Codex and `data/claude-sessions.json` for Claude.
- The default working directory is `./workspace`, shared by both backends, and is created automatically if it does not exist.
- Before each answer, the bot posts a short status block in the thread showing whether it started or resumed a backend session, what Discord context was sent, how many images were attached, what model arg was used, and any per-turn usage reported by the CLI.
- The Codex bot invokes `codex exec` with `--ask-for-approval never --sandbox danger-full-access`, so Codex child sessions run non-interactively with full local shell access.
- When the Codex CLI fails, the bot prefers the most useful surfaced CLI error text (for example account usage-limit errors) instead of only echoing an internal wrapper warning.
- On macOS, if no explicit proxy env vars are set, the bot auto-detects the current system proxy and applies it to Discord REST, the Discord gateway connection, attachment downloads, and inherited child-process env vars. SOCKS-only system proxy setups may still need explicit `HTTP_PROXY` / `HTTPS_PROXY` env vars for Discord traffic.

If you later want to use a custom server emoji instead of a Unicode emoji, also grant `Use External Emojis` when needed.

Typing indicators do not need extra Discord privileges beyond the existing send-message permissions used by the bot.

Codex `/status` shows the 5h and weekly usage limits from the latest local Codex `token_count` event in `~/.codex/sessions/*.jsonl`.

For slash commands, invite the app with the `applications.commands` scope in addition to the normal `bot` scope. If you are testing in one server, setting `DISCORD_GUILD_ID` makes command registration much faster than waiting for global propagation.

## Test

```bash
pnpm test
```
