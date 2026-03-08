import fs from "node:fs";
import path from "node:path";

import dotenv from "dotenv";

dotenv.config();

function requireEnv(name) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export function loadConfig() {
  const discordBotToken = requireEnv("DISCORD_BOT_TOKEN");
  const codexBin = process.env.CODEX_BIN?.trim() || "codex";
  const codexCwd = path.resolve(process.env.CODEX_CWD?.trim() || path.join(process.cwd(), "workspace"));
  const sessionStorePath = path.resolve(process.cwd(), "data", "sessions.json");

  fs.mkdirSync(codexCwd, { recursive: true });

  return {
    discordBotToken,
    codexBin,
    codexCwd,
    sessionStorePath
  };
}
