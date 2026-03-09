function formatPercentLeft(usedPercent) {
  if (typeof usedPercent !== "number") {
    return "?";
  }

  return `${Math.max(0, Math.round(100 - usedPercent))}%`;
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

const HELP_COMMAND = {
  name: "help",
  description: "Show bot usage and local slash commands"
};

const STATUS_COMMAND = {
  name: "status",
  description: "Show account usage limits"
};

export function getSlashCommands({ includeStatus = false } = {}) {
  const commands = [HELP_COMMAND];

  if (includeStatus) {
    commands.push(STATUS_COMMAND);
  }

  return commands;
}

export async function registerSlashCommands(client, discordGuildId, commands) {
  if (!client.application) {
    throw new Error("Discord application client is not ready.");
  }

  if (discordGuildId) {
    const guild = await client.guilds.fetch(discordGuildId);
    await guild.commands.set(commands);

    return {
      commandCount: commands.length,
      scope: "guild"
    };
  }

  await client.application.commands.set(commands);

  return {
    commandCount: commands.length,
    scope: "global"
  };
}

export function buildHelpMessage({
  botName = "codex",
  includeStatus = false,
  providerName = "Codex"
} = {}) {
  const lines = [
    `**discord-${botName} help**`,
    `\`@${botName} your prompt\``,
    `\`@${botName} --model gpt-5 your prompt\``,
    `attach image(s) + \`@${botName} your prompt\``,
    `inside a bot-created thread, \`@${botName}\` continues the same ${providerName} session`,
    "",
    "**slash commands**",
    "`/help` show this help"
  ];

  if (includeStatus) {
    lines.push("`/status` show account usage limits");
  }

  lines.push("", `slash commands do not call ${providerName} and do not consume model tokens`);

  return lines.join("\n");
}

export function buildStatusMessage({ codexStatus }) {
  if (!codexStatus) {
    return "account status unavailable";
  }

  const primary = codexStatus.rate_limits?.primary ?? {};
  const secondary = codexStatus.rate_limits?.secondary ?? {};

  return [
    `**weekly limit: ${formatPercentLeft(secondary.used_percent)} left (resets ${formatReset(secondary.resets_at)})**`,
    `5h limit: ${formatPercentLeft(primary.used_percent)} left (resets ${formatReset(primary.resets_at)})`
  ].join("\n");
}
