import test from "node:test";
import assert from "node:assert/strict";

import { loadConfig } from "./config.js";

function withEnv(env, fn) {
  const previous = {
    ALLOWED_BOT_IDS: process.env.ALLOWED_BOT_IDS,
    CLAUDE_BIN: process.env.CLAUDE_BIN,
    CLAUDE_CWD: process.env.CLAUDE_CWD,
    CLAUDE_DISCORD_BOT_TOKEN: process.env.CLAUDE_DISCORD_BOT_TOKEN,
    CODEX_BIN: process.env.CODEX_BIN,
    CODEX_CWD: process.env.CODEX_CWD,
    CODEX_DISCORD_BOT_TOKEN: process.env.CODEX_DISCORD_BOT_TOKEN,
    DISCORD_BOT_TOKEN: process.env.DISCORD_BOT_TOKEN,
    DISCORD_GUILD_ID: process.env.DISCORD_GUILD_ID
  };

  for (const [key, value] of Object.entries(env)) {
    if (value == null) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    return fn();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value == null) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

test("loadConfig requires at least one bot token", () => {
  assert.throws(
    () => withEnv({
      CLAUDE_DISCORD_BOT_TOKEN: null,
      CODEX_DISCORD_BOT_TOKEN: null,
      DISCORD_BOT_TOKEN: null
    }, () => loadConfig()),
    /Missing Discord bot token/
  );
});

test("loadConfig returns both Codex and Claude bot configs when present", () => {
  const config = withEnv({
    ALLOWED_BOT_IDS: "bot-1,bot-2",
    CLAUDE_BIN: "claude-code",
    CLAUDE_CWD: "./workspace/claude",
    CLAUDE_DISCORD_BOT_TOKEN: "claude-token",
    CODEX_BIN: "codex-cli",
    CODEX_CWD: "./workspace/codex",
    CODEX_DISCORD_BOT_TOKEN: "codex-token",
    DISCORD_BOT_TOKEN: null,
    DISCORD_GUILD_ID: "guild-123"
  }, () => loadConfig());

  assert.equal(config.discordGuildId, "guild-123");
  assert.deepEqual([...config.allowedBotIds], ["bot-1", "bot-2"]);
  assert.equal(config.bots.length, 2);
  assert.deepEqual(
    config.bots.map((bot) => bot.kind),
    ["codex", "claude"]
  );
  assert.equal(config.bots[0].codexBin, "codex-cli");
  assert.match(config.bots[0].codexCwd, /workspace\/codex$/);
  assert.equal(config.bots[1].claudeBin, "claude-code");
  assert.match(config.bots[1].claudeCwd, /workspace\/claude$/);
});

test("loadConfig still accepts DISCORD_BOT_TOKEN for the Codex bot", () => {
  const config = withEnv({
    CLAUDE_DISCORD_BOT_TOKEN: null,
    CODEX_DISCORD_BOT_TOKEN: null,
    DISCORD_BOT_TOKEN: "legacy-codex-token"
  }, () => loadConfig());

  assert.equal(config.bots.length, 1);
  assert.equal(config.bots[0].kind, "codex");
  assert.equal(config.bots[0].discordBotToken, "legacy-codex-token");
});