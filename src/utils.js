const DISCORD_MESSAGE_LIMIT = 2000;

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripMentionPattern(content, pattern) {
  if (!content) {
    return "";
  }

  return content.replace(pattern, "").trim();
}

export function stripBotMention(content, botUserId) {
  return stripMentionPattern(content, new RegExp(`<@!?${escapeRegex(botUserId)}>`, "g"));
}

export function stripLeadingDiscordMentions(content) {
  if (!content) {
    return "";
  }

  return content
    .replace(/^(?:\s*(?:<@!?\d+>|<@&\d+>|<#\d+>|@everyone|@here))+/g, "")
    .trim();
}

export function parsePromptCommand(content) {
  const body = String(content || "").trim();

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

export function parseMentionCommand(content, botUserId) {
  return parsePromptCommand(stripBotMention(content, botUserId));
}

export function canProcessMessageAuthor(author, allowedBotIds = new Set()) {
  return !author.bot || allowedBotIds.has(author.id);
}

function formatCount(value) {
  return typeof value === "number" ? value.toLocaleString("en-US") : "?";
}

export function buildTurnStatusMessage({
  imageCount = 0,
  mode,
  model,
  providerName = "Codex",
  sessionId,
  sessionIdLabel,
  contextLabel = "context",
  contextValue = null,
  usage,
  codexThreadId
}) {
  const effectiveSessionId = sessionId ?? codexThreadId;
  const effectiveSessionIdLabel = sessionIdLabel || `${providerName.toLowerCase()} session`;
  const imageLine = imageCount > 0 ? `${imageCount} attached` : "none";
  const modeLine = mode === "resume" ? `resumed existing ${providerName} session` : `started new ${providerName} session`;
  const effectiveContextValue =
    contextValue ??
    (mode === "resume"
      ? `current message only; history via ${providerName} session`
      : "current message only");
  const modelLine = model ? `\`${model}\`` : "default (no `-m` passed)";
  const usageLine = usage
    ? `input ${formatCount(usage.input_tokens)} | cached ${formatCount(usage.cached_input_tokens)} | output ${formatCount(usage.output_tokens)}`
    : "unavailable";

  return [
    `**${providerName} Status**`,
    `mode: ${modeLine}`,
    `${contextLabel}: ${effectiveContextValue}`,
    `images: ${imageLine}`,
    `model arg: ${modelLine}`,
    `${effectiveSessionIdLabel}: \`${effectiveSessionId}\``,
    `usage: ${usageLine}`
  ].join("\n");
}

export function buildThreadName(prompt, prefix = "codex") {
  const normalized = prompt.replace(/\s+/g, " ").trim();

  if (!normalized) {
    return prefix;
  }

  return `${prefix}: ${normalized}`.slice(0, 100);
}

export function splitTextMessage(text, limit = DISCORD_MESSAGE_LIMIT) {
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

export function splitDiscordMessage(text, limit = DISCORD_MESSAGE_LIMIT) {
  return splitTextMessage(text, limit);
}

export function splitDiscordMessageWithPrefix(prefix, text, limit = DISCORD_MESSAGE_LIMIT) {
  const firstChunkLimit = Math.max(1, limit - prefix.length - 1);
  const chunks = splitDiscordMessage(text, firstChunkLimit);
  const [firstChunk, ...restChunks] = chunks;

  return [`${prefix}\n${firstChunk}`, ...restChunks];
}

export function formatError(error) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
