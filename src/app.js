import {
  Client,
  GatewayIntentBits,
  ThreadAutoArchiveDuration
} from "discord.js";

import { downloadImageAttachments } from "./attachments.js";
import { CodexClient } from "./codex.js";
import { getLatestCodexStatus } from "./codex-status.js";
import { loadConfig } from "./config.js";
import { SessionStore } from "./session-store.js";
import {
  buildHelpMessage,
  buildStatusMessage,
  registerSlashCommands
} from "./slash-commands.js";
import {
  buildTurnStatusMessage,
  buildThreadName,
  canProcessMessageAuthor,
  formatError,
  parseMentionCommand,
  stripLeadingDiscordMentions,
  splitDiscordMessageWithPrefix,
} from "./utils.js";

function log(message, details = {}) {
  const payload = Object.keys(details).length > 0 ? ` ${JSON.stringify(details)}` : "";
  console.log(`${new Date().toISOString()} ${message}${payload}`);
}

const config = loadConfig();
const sessionStore = new SessionStore(config.sessionStorePath);
const codex = new CodexClient(config);
const activeThreads = new Set();
const ACK_EMOJI = "👀";
const TYPING_INTERVAL_MS = 8_000;
const startedAt = new Date();
let commandScope = config.discordGuildId ? "guild" : "global";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

function hasAnyDiscordMention(message) {
  return (
    message.mentions.everyone ||
    message.mentions.users.size > 0 ||
    message.mentions.roles.size > 0 ||
    message.mentions.channels.size > 0
  );
}

function isMentionForBot(message) {
  return hasAnyDiscordMention(message);
}

function requirePrompt(prompt) {
  return prompt.trim().length > 0;
}

async function acknowledgeRequest(message) {
  try {
    await message.react(ACK_EMOJI);
  } catch (error) {
    log("discord.react.failed", {
      messageId: message.id,
      emoji: ACK_EMOJI,
      error: formatError(error)
    });
  }
}

function startTypingIndicator(thread) {
  let stopped = false;

  const stop = () => {
    if (stopped) {
      return;
    }

    stopped = true;
    clearInterval(intervalId);
  };

  const tick = async () => {
    if (stopped) {
      return;
    }

    try {
      await thread.sendTyping();
    } catch (error) {
      log("discord.typing.failed", {
        channelId: thread.id,
        error: formatError(error)
      });
      stop();
    }
  };

  const intervalId = setInterval(() => {
    void tick();
  }, TYPING_INTERVAL_MS);

  intervalId.unref?.();
  void tick();

  return stop;
}

async function sendCodexResponse(thread, requesterId, responseText) {
  const prefix = `<@${requesterId}>`;
  const [firstChunk, ...restChunks] = splitDiscordMessageWithPrefix(prefix, responseText);

  await thread.send({
    content: firstChunk,
    allowedMentions: {
      users: [requesterId]
    }
  });

  for (const chunk of restChunks) {
    await thread.send(chunk);
  }
}

async function sendCodexFailure(thread, requesterId, message) {
  await thread.send({
    content: `<@${requesterId}> ${message}`,
    allowedMentions: {
      users: [requesterId]
    }
  });
}

async function replyWithoutPing(message, content) {
  await message.reply({
    content,
    allowedMentions: {
      repliedUser: false
    }
  });
}

async function sendThreadSuccess(thread, requesterId, statusText, responseText) {
  await thread.send(statusText);
  await sendCodexResponse(thread, requesterId, responseText);
}

async function sendThreadFailure(thread, requesterId, failureText) {
  await sendCodexFailure(thread, requesterId, failureText);
}

async function handleNewChannelMention(message, command) {
  const { model, prompt } = command;
  let thread;
  let stopTyping = () => {};
  let attachments = {
    count: 0,
    filePaths: [],
    cleanup: async () => {}
  };

  try {
    thread = message.hasThread && message.thread
      ? message.thread
      : await message.startThread({
          name: buildThreadName(prompt),
          autoArchiveDuration: ThreadAutoArchiveDuration.OneDay,
          reason: `Codex conversation started by ${message.author.tag}`
        });
  } catch (error) {
    throw new Error(`Could not create a thread from this message: ${formatError(error)}`);
  }

  stopTyping = startTypingIndicator(thread);
  activeThreads.add(thread.id);

  log("codex.thread.created", {
    discordThreadId: thread.id,
    starterMessageId: message.id,
    userId: message.author.id
  });

  try {
    attachments = await downloadImageAttachments(message);
    const result = await codex.createTurn({
      prompt,
      model,
      imagePaths: attachments.filePaths
    });
    const now = new Date().toISOString();

    await sessionStore.upsert({
      discordThreadId: thread.id,
      discordParentChannelId: message.channelId,
      starterMessageId: message.id,
      codexThreadId: result.threadId,
      createdByUserId: message.author.id,
      createdAt: now,
      lastActivityAt: now,
      lastRequestedModel: model,
      lastUsage: result.usage
    });
    await sessionStore.recordTurn({
      discordThreadId: thread.id,
      imageCount: attachments.count,
      mode: "new",
      requestedModel: model,
      usage: result.usage,
      userId: message.author.id
    });

    stopTyping();
    await sendThreadSuccess(
      thread,
      message.author.id,
      buildTurnStatusMessage({
        mode: "new",
        codexThreadId: result.threadId,
        imageCount: attachments.count,
        model,
        usage: result.usage
      }),
      result.responseText
    );

    log("codex.turn.created", {
      discordThreadId: thread.id,
      codexThreadId: result.threadId,
      requestedModel: model
    });
  } catch (error) {
    stopTyping();
    await sendThreadFailure(
      thread,
      message.author.id,
      `Codex request failed: ${formatError(error)}`
    );
    log("codex.turn.failed", {
      discordThreadId: thread.id,
      error: formatError(error)
    });
  } finally {
    stopTyping();
    await attachments.cleanup();
    activeThreads.delete(thread.id);
  }
}

async function handleThreadMention(message, command) {
  const { model, prompt } = command;
  const thread = message.channel;
  const session = sessionStore.get(thread.id);
  let stopTyping = () => {};
  let attachments = {
    count: 0,
    filePaths: [],
    cleanup: async () => {}
  };

  if (!session) {
    await replyWithoutPing(message, "This thread is not connected to a Codex session. Start from a normal channel with `@codex`.");
    return;
  }

  if (activeThreads.has(thread.id)) {
    await replyWithoutPing(message, "A Codex request is already running in this thread.");
    return;
  }

  stopTyping = startTypingIndicator(thread);
  activeThreads.add(thread.id);

  log("codex.thread.resuming", {
    discordThreadId: thread.id,
    codexThreadId: session.codexThreadId,
    userId: message.author.id
  });

  try {
    attachments = await downloadImageAttachments(message);
    const result = await codex.resumeTurn({
      threadId: session.codexThreadId,
      imagePaths: attachments.filePaths,
      prompt,
      model
    });

    await sessionStore.upsert({
      ...session,
      codexThreadId: result.threadId,
      lastActivityAt: new Date().toISOString(),
      lastRequestedModel: model,
      lastUsage: result.usage
    });
    await sessionStore.recordTurn({
      discordThreadId: thread.id,
      imageCount: attachments.count,
      mode: "resume",
      requestedModel: model,
      usage: result.usage,
      userId: message.author.id
    });

    stopTyping();
    await sendThreadSuccess(
      thread,
      message.author.id,
      buildTurnStatusMessage({
        mode: "resume",
        codexThreadId: result.threadId,
        imageCount: attachments.count,
        model,
        usage: result.usage
      }),
      result.responseText
    );

    log("codex.turn.resumed", {
      discordThreadId: thread.id,
      codexThreadId: result.threadId,
      requestedModel: model
    });
  } catch (error) {
    stopTyping();
    await sendThreadFailure(
      thread,
      message.author.id,
      `Codex resume failed: ${formatError(error)}`
    );
    log("codex.resume.failed", {
      discordThreadId: thread.id,
      codexThreadId: session.codexThreadId,
      error: formatError(error)
    });
  } finally {
    stopTyping();
    await attachments.cleanup();
    activeThreads.delete(thread.id);
  }
}

client.once("clientReady", () => {
  log("discord.ready", {
    botUserId: client.user?.id,
    botTag: client.user?.tag,
    codexCwd: config.codexCwd
  });
});

client.once("clientReady", async () => {
  try {
    const result = await registerSlashCommands(client, config.discordGuildId);
    commandScope = result.scope;

    log("discord.commands.registered", result);
  } catch (error) {
    log("discord.commands.failed", {
      error: formatError(error),
      scope: config.discordGuildId ? "guild" : "global"
    });
  }
});

client.on("messageCreate", async (message) => {
  if (!message.inGuild()) {
    return;
  }

  if (!canProcessMessageAuthor(message.author, config.allowedBotIds)) {
    return;
  }

  if (message.author.bot && config.allowedBotIds.has(message.author.id)) {
    log("discord.allowed_bot.message", {
      attachmentCount: message.attachments.size,
      authorId: message.author.id,
      content: message.content,
      mentionRoleIds: [...message.mentions.roles.keys()],
      mentionUserIds: [...message.mentions.users.keys()],
      messageId: message.id
    });
  }

  if (!isMentionForBot(message)) {
    return;
  }

  const normalizedContent = stripLeadingDiscordMentions(message.content);
  const command = parseMentionCommand(normalizedContent, client.user.id);
  const prompt = command.prompt;

  if (!requirePrompt(prompt)) {
    await replyWithoutPing(
      message,
      "Please include a prompt after `@codex`. Optional syntax: `@codex --model <name> your prompt`. Images are supported when attached to the same message."
    );
    return;
  }

  await acknowledgeRequest(message);

  log("discord.mention.received", {
    authorIsBot: message.author.bot,
    attachmentCount: message.attachments.size,
    messageId: message.id,
    channelId: message.channelId,
    hasAnyDiscordMention: hasAnyDiscordMention(message),
    isThread: message.channel.isThread(),
    mentionRoleIds: [...message.mentions.roles.keys()],
    mentionUserIds: [...message.mentions.users.keys()],
    promptLength: prompt.length,
    requestedModel: command.model,
    userId: message.author.id
  });

  try {
    if (message.channel.isThread()) {
      await handleThreadMention(message, command);
      return;
    }

    await handleNewChannelMention(message, command);
  } catch (error) {
    const failure = `Request failed: ${formatError(error)}`;

    try {
      await replyWithoutPing(message, failure);
    } catch {
      log("discord.reply.failed", {
        messageId: message.id,
        error: failure
      });
    }
  }
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) {
    return;
  }

  try {
    if (interaction.commandName === "help") {
      await interaction.reply({
        content: buildHelpMessage(),
        ephemeral: true
      });
      return;
    }

    if (interaction.commandName === "status") {
      const codexStatus = await getLatestCodexStatus();

      await interaction.reply({
        content: buildStatusMessage({
          activeRequestCount: activeThreads.size,
          codexStatus,
          codexCwd: config.codexCwd,
          commandScope,
          startedAt,
          stats: sessionStore.getStats(),
          trackedThreadCount: sessionStore.countThreads()
        }),
        ephemeral: true
      });
      return;
    }
  } catch (error) {
    const content = `Command failed: ${formatError(error)}`;

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({
        content,
        ephemeral: true
      });
      return;
    }

    await interaction.reply({
      content,
      ephemeral: true
    });
  }
});

process.on("unhandledRejection", (error) => {
  log("process.unhandledRejection", {
    error: formatError(error)
  });
});

process.on("uncaughtException", (error) => {
  log("process.uncaughtException", {
    error: formatError(error)
  });
});

await sessionStore.load();
await client.login(config.discordBotToken);
