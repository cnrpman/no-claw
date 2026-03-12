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

function createProviderConfig({
  kind,
  binEnvName,
  defaultBin,
  cwdEnvName,
  defaultCwd,
  sessionStorePath
}) {
  const cwd = path.resolve(process.env[cwdEnvName]?.trim() || defaultCwd);

  fs.mkdirSync(cwd, { recursive: true });

  return {
    id: kind,
    kind,
    providerName: kind === "codex" ? "Codex" : "Claude",
    sessionIdLabel: kind === "codex" ? "codex thread" : "claude session",
    sessionStorePath,
    [`${kind}Bin`]: process.env[binEnvName]?.trim() || defaultBin,
    [`${kind}Cwd`]: cwd
  };
}

function createDiscordBinding({
  botName,
  discordBotToken,
  providerId
}) {
  if (!discordBotToken) {
    return null;
  }

  return {
    botName,
    discordBotToken,
    platform: "discord",
    providerId
  };
}

function createFeishuBinding({
  appId,
  appSecret,
  botName,
  providerId
}) {
  if (!appId && !appSecret) {
    return null;
  }

  if (!appId || !appSecret) {
    throw new Error(`Incomplete Feishu credentials for ${providerId}. Set both ${providerId.toUpperCase()}_FEISHU_APP_ID and ${providerId.toUpperCase()}_FEISHU_APP_SECRET.`);
  }

  return {
    appId,
    appSecret,
    botName,
    platform: "feishu",
    providerId
  };
}

export function loadConfig() {
  const discordGuildId = process.env.DISCORD_GUILD_ID?.trim() || null;
  const allowedBotIds = parseIdList(process.env.ALLOWED_BOT_IDS);
  const defaultWorkspace = path.join(process.cwd(), "workspace");
  const providers = [
    createProviderConfig({
      kind: "codex",
      binEnvName: "CODEX_BIN",
      defaultBin: "codex",
      cwdEnvName: "CODEX_CWD",
      defaultCwd: defaultWorkspace,
      sessionStorePath: path.resolve(process.cwd(), "data", "sessions.json")
    }),
    createProviderConfig({
      kind: "claude",
      binEnvName: "CLAUDE_BIN",
      defaultBin: "claude",
      cwdEnvName: "CLAUDE_CWD",
      defaultCwd: defaultWorkspace,
      sessionStorePath: path.resolve(process.cwd(), "data", "claude-sessions.json")
    })
  ];
  const bindings = [
    createDiscordBinding({
      botName: "codex",
      discordBotToken: optionalEnv("CODEX_DISCORD_BOT_TOKEN") || optionalEnv("DISCORD_BOT_TOKEN"),
      providerId: "codex"
    }),
    createDiscordBinding({
      botName: "claude",
      discordBotToken: optionalEnv("CLAUDE_DISCORD_BOT_TOKEN"),
      providerId: "claude"
    }),
    createFeishuBinding({
      appId: optionalEnv("CODEX_FEISHU_APP_ID"),
      appSecret: optionalEnv("CODEX_FEISHU_APP_SECRET"),
      botName: "codex",
      providerId: "codex"
    }),
    createFeishuBinding({
      appId: optionalEnv("CLAUDE_FEISHU_APP_ID"),
      appSecret: optionalEnv("CLAUDE_FEISHU_APP_SECRET"),
      botName: "claude",
      providerId: "claude"
    })
  ].filter(Boolean);
  const enabledProviderIds = new Set(bindings.map((binding) => binding.providerId));

  if (bindings.length === 0) {
    throw new Error(
      "Missing platform credentials. Set CODEX_DISCORD_BOT_TOKEN and/or CLAUDE_DISCORD_BOT_TOKEN, or set CODEX_FEISHU_APP_ID + CODEX_FEISHU_APP_SECRET and/or CLAUDE_FEISHU_APP_ID + CLAUDE_FEISHU_APP_SECRET. DISCORD_BOT_TOKEN is still accepted as a Codex fallback."
    );
  }

  return {
    discordGuildId,
    allowedBotIds,
    bindings,
    providers: providers.filter((provider) => enabledProviderIds.has(provider.id))
  };
}
