import {
  applySystemProxy,
  installDiscordGlobalWebSocketPatch
} from "./system-proxy.js";
import { startDiscordBot } from "./app.js";
import { ClaudeClient } from "./claude.js";
import { getLatestCodexStatus } from "./codex-status.js";
import { loadConfig } from "./config.js";
import { CodexClient } from "./codex.js";
import { startFeishuBot } from "./feishu.js";
import { SessionStore } from "./session-store.js";
import { TurnOrchestrator } from "./turn-orchestrator.js";

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

function createProviderClient(providerConfig) {
  if (providerConfig.kind === "codex") {
    return new CodexClient({
      codexBin: providerConfig.codexBin,
      codexCwd: providerConfig.codexCwd
    });
  }

  return new ClaudeClient({
    claudeBin: providerConfig.claudeBin,
    claudeCwd: providerConfig.claudeCwd
  });
}

function getProviderWorkdir(providerConfig) {
  return providerConfig[`${providerConfig.kind}Cwd`];
}

const providerEntries = await Promise.all(
  config.providers.map(async (providerConfig) => {
    const sessionStore = new SessionStore(providerConfig.sessionStorePath);
    const providerClient = createProviderClient(providerConfig);
    await sessionStore.load();

    return [
      providerConfig.id,
      {
        ...providerConfig,
        client: providerClient,
        orchestrator: new TurnOrchestrator({
          providerClient,
          providerId: providerConfig.id,
          sessionStore
        }),
        statusFetcher: providerConfig.kind === "codex" ? getLatestCodexStatus : null,
        workdir: getProviderWorkdir(providerConfig)
      }
    ];
  })
);
const providers = new Map(providerEntries);

const botPromises = config.bindings.map((binding) => {
  const provider = providers.get(binding.providerId);

  if (!provider) {
    throw new Error(`Missing provider runtime for ${binding.providerId}.`);
  }

  if (binding.platform === "discord") {
    return startDiscordBot({
      allowedBotIds: config.allowedBotIds,
      botName: binding.botName,
      botToken: binding.discordBotToken,
      discordGuildId: config.discordGuildId,
      orchestrator: provider.orchestrator,
      providerId: provider.id,
      providerName: provider.providerName,
      sessionIdLabel: provider.sessionIdLabel,
      statusFetcher: provider.statusFetcher,
      workdir: provider.workdir
    });
  }

  if (binding.platform === "feishu") {
    return startFeishuBot({
      appId: binding.appId,
      appSecret: binding.appSecret,
      botName: binding.botName,
      orchestrator: provider.orchestrator,
      providerId: provider.id,
      providerName: provider.providerName,
      sessionIdLabel: provider.sessionIdLabel,
      workdir: provider.workdir
    });
  }

  throw new Error(`Unsupported platform binding: ${binding.platform}`);
});

await Promise.all(botPromises);
