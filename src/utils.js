const DISCORD_MESSAGE_LIMIT = 2000;

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function stripBotMention(content, botUserId) {
  if (!content) {
    return "";
  }

  const mentionPattern = new RegExp(`<@!?${escapeRegex(botUserId)}>`, "g");

  return content.replace(mentionPattern, "").trim();
}

export function parseMentionCommand(content, botUserId) {
  const body = stripBotMention(content, botUserId);

  if (!body) {
    return {
      model: null,
      prompt: ""
    };
  }

  const modelMatch = body.match(/^(?:--model|-m)\s+(?:"([^"]+)"|'([^']+)'|(\S+))(?:\s+([\s\S]*))?$/);

  if (!modelMatch) {
    return {
      model: null,
      prompt: body
    };
  }

  return {
    model: modelMatch[1] || modelMatch[2] || modelMatch[3] || null,
    prompt: (modelMatch[4] || "").trim()
  };
}

function formatCount(value) {
  return typeof value === "number" ? value.toLocaleString("en-US") : "?";
}

export function buildTurnStatusMessage({ mode, codexThreadId, model, usage }) {
  const modeLine = mode === "resume" ? "resumed existing Codex session" : "started new Codex session";
  const contextLine =
    mode === "resume"
      ? "current mention only; history via Codex session"
      : "current mention only";
  const modelLine = model ? `\`${model}\`` : "default (no `-m` passed)";
  const usageLine = usage
    ? `input ${formatCount(usage.input_tokens)} | cached ${formatCount(usage.cached_input_tokens)} | output ${formatCount(usage.output_tokens)}`
    : "unavailable";

  return [
    "**Codex Status**",
    `mode: ${modeLine}`,
    `discord context: ${contextLine}`,
    `model arg: ${modelLine}`,
    `codex thread: \`${codexThreadId}\``,
    `usage: ${usageLine}`
  ].join("\n");
}

export function buildThreadName(prompt) {
  const normalized = prompt.replace(/\s+/g, " ").trim();

  if (!normalized) {
    return "codex";
  }

  return `codex: ${normalized}`.slice(0, 100);
}

export function splitDiscordMessage(text, limit = DISCORD_MESSAGE_LIMIT) {
  const normalized = text.trim();

  if (!normalized) {
    return ["(No response.)"];
  }

  if (normalized.length <= limit) {
    return [normalized];
  }

  const chunks = [];
  let cursor = normalized;

  while (cursor.length > limit) {
    const window = cursor.slice(0, limit);
    const splitAt =
      window.lastIndexOf("\n\n") > 0
        ? window.lastIndexOf("\n\n")
        : window.lastIndexOf("\n") > 0
          ? window.lastIndexOf("\n")
          : window.lastIndexOf(" ") > 0
            ? window.lastIndexOf(" ")
            : limit;

    chunks.push(cursor.slice(0, splitAt).trim());
    cursor = cursor.slice(splitAt).trim();
  }

  if (cursor) {
    chunks.push(cursor);
  }

  return chunks.filter(Boolean);
}

export function formatError(error) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
