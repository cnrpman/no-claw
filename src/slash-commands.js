function formatCount(value) {
  return typeof value === "number" ? value.toLocaleString("en-US") : "?";
}

function formatPercentLeft(usedPercent) {
  if (typeof usedPercent !== "number") {
    return "?";
  }

  return `${Math.max(0, Math.round(100 - usedPercent))}%`;
}

function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }

  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }

  return `${seconds}s`;
}

function formatLastTurn(stats) {
  if (!stats.lastTurnAt) {
    return "none";
  }

  const parts = [stats.lastTurnAt];

  if (stats.lastTurnMode) {
    parts.push(stats.lastTurnMode);
  }

  if (stats.lastTurnUsage) {
    parts.push(
      `in ${formatCount(stats.lastTurnUsage.input_tokens)} / cached ${formatCount(stats.lastTurnUsage.cached_input_tokens)} / out ${formatCount(stats.lastTurnUsage.output_tokens)}`
    );
  }

  return parts.join(" | ");
}

function formatReset(epochSeconds) {
  if (typeof epochSeconds !== "number") {
    return "unknown";
  }

  return new Date(epochSeconds * 1000).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  });
}

function buildCodexStatusSection(codexStatus) {
  if (!codexStatus) {
    return [
      "**codex account**",
      "status: unavailable",
      "source: no local Codex token_count event found"
    ];
  }

  const total = codexStatus.info?.total_token_usage ?? {};
  const last = codexStatus.info?.last_token_usage ?? {};
  const primary = codexStatus.rate_limits?.primary ?? {};
  const secondary = codexStatus.rate_limits?.secondary ?? {};
  const snapshotLines =
    codexStatus.usageTimestamp &&
    codexStatus.rateLimitTimestamp &&
    codexStatus.usageTimestamp !== codexStatus.rateLimitTimestamp
      ? [
          `usage snapshot: ${codexStatus.usageTimestamp}`,
          `limit snapshot: ${codexStatus.rateLimitTimestamp}`
        ]
      : [`snapshot: ${codexStatus.timestamp ?? "unknown"}`];

  return [
    "**codex account**",
    ...snapshotLines,
    `**weekly limit: ${formatPercentLeft(secondary.used_percent)} left (resets ${formatReset(secondary.resets_at)})**`,
    `5h limit: ${formatPercentLeft(primary.used_percent)} left (resets ${formatReset(primary.resets_at)})`,
    `total usage: in ${formatCount(total.input_tokens)} | cached ${formatCount(total.cached_input_tokens)} | out ${formatCount(total.output_tokens)}`,
    `last usage: in ${formatCount(last.input_tokens)} | cached ${formatCount(last.cached_input_tokens)} | out ${formatCount(last.output_tokens)}`,
    "source: latest local Codex session token_count event"
  ];
}

export const SLASH_COMMANDS = [
  {
    name: "help",
    description: "Show bot usage and local slash commands"
  },
  {
    name: "status",
    description: "Show local bot status and tracked usage without calling the CLI"
  }
];

export async function registerSlashCommands(client, discordGuildId) {
  if (!client.application) {
    throw new Error("Discord application client is not ready.");
  }

  if (discordGuildId) {
    const guild = await client.guilds.fetch(discordGuildId);
    await guild.commands.set(SLASH_COMMANDS);

    return {
      commandCount: SLASH_COMMANDS.length,
      scope: "guild"
    };
  }

  await client.application.commands.set(SLASH_COMMANDS);

  return {
    commandCount: SLASH_COMMANDS.length,
    scope: "global"
  };
}

function buildUnavailableAccountSection(providerSlug, providerName) {
  return [
    `**${providerSlug} account**`,
    "status: unavailable",
    `source: local ${providerName} account status is not implemented`
  ];
}

export function buildHelpMessage({
  botName = "codex",
  providerName = "Codex"
} = {}) {
  return [
    `**discord-${botName} help**`,
    `\`@${botName} your prompt\``,
    `\`@${botName} --model gpt-5 your prompt\``,
    `attach image(s) + \`@${botName} your prompt\``,
    `inside a bot-created thread, \`@${botName}\` continues the same ${providerName} session`,
    "",
    "**slash commands**",
    "`/help` show this help",
    "`/status` show local bot status + tracked usage",
    "",
    `slash commands do not call ${providerName} and do not consume model tokens`
  ].join("\n");
}

export function buildStatusMessage({
  activeRequestCount,
  accountStatusLines = null,
  botName = "codex",
  codexStatus,
  commandScope,
  cwd,
  cwdLabel,
  codexCwd,
  providerName = "Codex",
  startedAt,
  stats,
  trackedThreadCount
}) {
  const effectiveBotName = botName;
  const effectiveCwd = cwd ?? codexCwd;
  const effectiveCwdLabel = cwdLabel ?? `${effectiveBotName} cwd`;
  const effectiveAccountStatusLines = accountStatusLines ?? (
    effectiveBotName === "codex"
      ? buildCodexStatusSection(codexStatus)
      : buildUnavailableAccountSection(effectiveBotName, providerName)
  );

  return [
    `**discord-${effectiveBotName} status**`,
    "",
    ...effectiveAccountStatusLines,
    "",
    "**bot**",
    "status: online",
    `uptime: ${formatDuration(Date.now() - startedAt.getTime())}`,
    `command scope: ${commandScope}`,
    `active requests: ${activeRequestCount}`,
    `tracked threads: ${trackedThreadCount}`,
    `completed turns: ${stats.completedTurns}`,
    `bot-tracked usage: in ${formatCount(stats.totalInputTokens)} | cached ${formatCount(stats.totalCachedInputTokens)} | out ${formatCount(stats.totalOutputTokens)}`,
    `bot last turn: ${formatLastTurn(stats)}`,
    `${effectiveCwdLabel}: \`${effectiveCwd}\``,
    "",
    effectiveBotName === "codex"
      ? "zero-token status assembled from local bot state and local Codex files"
      : `zero-token status assembled from local bot state; local ${providerName} account usage is not implemented`
  ].join("\n");
}
