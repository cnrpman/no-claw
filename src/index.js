import {
  applySystemProxy,
  installDiscordGlobalWebSocketPatch
} from "./system-proxy.js";
import { startBot } from "./app.js";
import { ClaudeClient } from "./claude.js";
import { getLatestCodexStatus } from "./codex-status.js";
import { loadConfig } from "./config.js";
import { CodexClient } from "./codex.js";

function log(message, details = {}) {
  const payload = Object.keys(details).length > 0 ? ` ${JSON.stringify(details)}` : "";
  console.log(`${new Date().toISOString()} ${message}${payload}`);
}

const proxyState = await applySystemProxy({ logger: log });

if (proxyState.enabled) {
  installDiscordGlobalWebSocketPatch();
  log("network.proxy.gateway", {
    mode: "global-websocket"
  });
}

const config = loadConfig();

const botPromises = config.bots.map((botConfig) => {
  if (botConfig.kind === "codex") {
    return startBot({
      allowedBotIds: config.allowedBotIds,
      botName: "codex",
      botToken: botConfig.discordBotToken,
      client: new CodexClient({
        codexBin: botConfig.codexBin,
        codexCwd: botConfig.codexCwd
      }),
      discordGuildId: config.discordGuildId,
      providerId: "codex",
      providerName: "Codex",
      sessionIdLabel: "codex thread",
      sessionStorePath: botConfig.sessionStorePath,
      statusFetcher: getLatestCodexStatus,
      workdir: botConfig.codexCwd
    });
  }

  return startBot({
    allowedBotIds: config.allowedBotIds,
    botName: "claude",
    botToken: botConfig.discordBotToken,
    client: new ClaudeClient({
      claudeBin: botConfig.claudeBin,
      claudeCwd: botConfig.claudeCwd
    }),
    discordGuildId: config.discordGuildId,
    providerId: "claude",
    providerName: "Claude",
    sessionIdLabel: "claude session",
    sessionStorePath: botConfig.sessionStorePath,
    workdir: botConfig.claudeCwd
  });
});

await Promise.all(botPromises);
