import fs from "node:fs";
import path from "node:path";

import dotenv from "dotenv";

dotenv.config({ quiet: true });

function parseIdList(value) {
  if (!value) {
    return new Set();
  }

  return new Set(
    value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
  );
}

function optionalEnv(name) {
  const value = process.env[name]?.trim();
  return value || null;
}

function createBotConfig({
  discordBotToken,
  kind,
  binEnvName,
  defaultBin,
  cwdEnvName,
  defaultCwd,
  sessionStorePath
}) {
  if (!discordBotToken) {
    return null;
  }

  const cwd = path.resolve(process.env[cwdEnvName]?.trim() || defaultCwd);

  fs.mkdirSync(cwd, { recursive: true });

  return {
    discordBotToken,
    kind,
    sessionStorePath,
    [`${kind}Bin`]: process.env[binEnvName]?.trim() || defaultBin,
    [`${kind}Cwd`]: cwd
  };
}

export function loadConfig() {
  const discordGuildId = process.env.DISCORD_GUILD_ID?.trim() || null;
  const allowedBotIds = parseIdList(process.env.ALLOWED_BOT_IDS);
  const defaultWorkspace = path.join(process.cwd(), "workspace");
  const bots = [
    createBotConfig({
      discordBotToken: optionalEnv("CODEX_DISCORD_BOT_TOKEN") || optionalEnv("DISCORD_BOT_TOKEN"),
      kind: "codex",
      binEnvName: "CODEX_BIN",
      defaultBin: "codex",
      cwdEnvName: "CODEX_CWD",
      defaultCwd: defaultWorkspace,
      sessionStorePath: path.resolve(process.cwd(), "data", "sessions.json")
    }),
    createBotConfig({
      discordBotToken: optionalEnv("CLAUDE_DISCORD_BOT_TOKEN"),
      kind: "claude",
      binEnvName: "CLAUDE_BIN",
      defaultBin: "claude",
      cwdEnvName: "CLAUDE_CWD",
      defaultCwd: defaultWorkspace,
      sessionStorePath: path.resolve(process.cwd(), "data", "claude-sessions.json")
    })
  ].filter(Boolean);

  if (bots.length === 0) {
    throw new Error(
      "Missing Discord bot token. Set CODEX_DISCORD_BOT_TOKEN and/or CLAUDE_DISCORD_BOT_TOKEN. DISCORD_BOT_TOKEN is still accepted as a Codex fallback."
    );
  }

  return {
    discordGuildId,
    allowedBotIds,
    bots
  };
}
