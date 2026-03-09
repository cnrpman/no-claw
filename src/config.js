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

function requireEnv(name) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export function loadConfig() {
  const discordBotToken = requireEnv("DISCORD_BOT_TOKEN");
  const discordGuildId = process.env.DISCORD_GUILD_ID?.trim() || null;
  const allowedBotIds = parseIdList(process.env.ALLOWED_BOT_IDS);
  const codexBin = process.env.CODEX_BIN?.trim() || "codex";
  const codexCwd = path.resolve(process.env.CODEX_CWD?.trim() || path.join(process.cwd(), "workspace"));
  const sessionStorePath = path.resolve(process.cwd(), "data", "sessions.json");

  fs.mkdirSync(codexCwd, { recursive: true });

  return {
    discordBotToken,
    discordGuildId,
    allowedBotIds,
    codexBin,
    codexCwd,
    sessionStorePath
  };
}
