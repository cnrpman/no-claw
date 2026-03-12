import {
  Client,
  GatewayIntentBits,
  MessageFlags,
  ThreadAutoArchiveDuration
} from "discord.js";

import { downloadImageAttachments } from "./attachments.js";
import {
  buildHelpMessage,
  buildStatusMessage,
  getSlashCommands,
  registerSlashCommands
} from "./slash-commands.js";
import {
  buildTurnStatusMessage,
  buildThreadName,
  canProcessMessageAuthor,
  formatError,
  parseMentionCommand,
  stripLeadingDiscordMentions,
  splitDiscordMessageWithPrefix
} from "./utils.js";
import {
  SessionNotFoundError,
  TurnBusyError
} from "./turn-orchestrator.js";

function log(message, details = {}) {
  const payload = Object.keys(details).length > 0 ? ` ${JSON.stringify(details)}` : "";
  console.log(`${new Date().toISOString()} ${message}${payload}`);
}

const ACK_EMOJI = "👀";
const TYPING_INTERVAL_MS = 8_000;

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

function hasAnyDiscordMention(message) {
  return (
    message.mentions.everyone ||
    message.mentions.users.size > 0 ||
    message.mentions.roles.size > 0 ||
    message.mentions.channels.size > 0
  );
}

export async function startDiscordBot({
  allowedBotIds,
  botName,
  botToken,
  discordGuildId,
  orchestrator,
  providerId,
  providerName,
  sessionIdLabel,
  statusFetcher = null,
  workdir
}) {
  let commandScope = discordGuildId ? "guild" : "global";

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent
    ]
  });

  function isMentionForBot(message) {
    return Boolean(client.user && message.mentions.users.has(client.user.id));
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
            name: buildThreadName(prompt, botName),
            autoArchiveDuration: ThreadAutoArchiveDuration.OneDay,
            reason: `${providerName} conversation started by ${message.author.tag}`
          });
    } catch (error) {
      throw new Error(`Could not create a thread from this message: ${formatError(error)}`);
    }

    stopTyping = startTypingIndicator(thread);

    log(`${providerId}.thread.created`, {
      discordThreadId: thread.id,
      starterMessageId: message.id,
      userId: message.author.id
    });

    try {
      attachments = await downloadImageAttachments(message);
      const result = await orchestrator.runTurn({
        imagePaths: attachments.filePaths,
        mode: "new",
        model,
        platformConversationId: thread.id,
        platformId: "discord",
        platformMessageId: message.id,
        platformParentId: message.channelId,
        prompt,
        sessionKey: thread.id,
        userId: message.author.id
      });

      stopTyping();
      await sendThreadSuccess(
        thread,
        message.author.id,
        buildTurnStatusMessage({
          contextLabel: "discord context",
          contextValue: "current mention only",
          imageCount: attachments.count,
          mode: result.mode,
          model,
          providerName,
          sessionId: result.sessionId,
          sessionIdLabel,
          usage: result.usage
        }),
        result.responseText
      );

      log(`${providerId}.turn.created`, {
        discordThreadId: thread.id,
        providerSessionId: result.sessionId,
        requestedModel: model
      });
    } catch (error) {
      stopTyping();
      await sendThreadFailure(
        thread,
        message.author.id,
        `${providerName} request failed: ${formatError(error)}`
      );
      log(`${providerId}.turn.failed`, {
        discordThreadId: thread.id,
        error: formatError(error)
      });
    } finally {
      stopTyping();
      await attachments.cleanup();
    }
  }

  async function handleThreadMention(message, command) {
    const { model, prompt } = command;
    const thread = message.channel;
    let stopTyping = () => {};
    let attachments = {
      count: 0,
      filePaths: [],
      cleanup: async () => {}
    };

    if (!orchestrator.hasSession(thread.id)) {
      await replyWithoutPing(message, `This thread is not connected to a ${providerName} session. Start from a normal channel with \`@${botName}\`.`);
      return;
    }

    if (orchestrator.isBusy(thread.id)) {
      await replyWithoutPing(message, `A ${providerName} request is already running in this thread.`);
      return;
    }

    stopTyping = startTypingIndicator(thread);

    log(`${providerId}.thread.resuming`, {
      conversationKey: thread.id,
      discordThreadId: thread.id,
      userId: message.author.id
    });

    try {
      attachments = await downloadImageAttachments(message);
      const result = await orchestrator.runTurn({
        imagePaths: attachments.filePaths,
        mode: "resume",
        model,
        platformConversationId: thread.id,
        platformId: "discord",
        platformMessageId: message.id,
        platformParentId: message.channelId,
        prompt,
        sessionKey: thread.id,
        userId: message.author.id
      });

      stopTyping();
      await sendThreadSuccess(
        thread,
        message.author.id,
        buildTurnStatusMessage({
          contextLabel: "discord context",
          contextValue: `current mention only; history via ${providerName} session`,
          imageCount: attachments.count,
          mode: result.mode,
          model,
          providerName,
          sessionId: result.sessionId,
          sessionIdLabel,
          usage: result.usage
        }),
        result.responseText
      );

      log(`${providerId}.turn.resumed`, {
        discordThreadId: thread.id,
        providerSessionId: result.sessionId,
        requestedModel: model
      });
    } catch (error) {
      if (error instanceof SessionNotFoundError) {
        await replyWithoutPing(message, `This thread is not connected to a ${providerName} session. Start from a normal channel with \`@${botName}\`.`);
        return;
      }

      if (error instanceof TurnBusyError) {
        await replyWithoutPing(message, `A ${providerName} request is already running in this thread.`);
        return;
      }

      stopTyping();
      await sendThreadFailure(
        thread,
        message.author.id,
        `${providerName} resume failed: ${formatError(error)}`
      );
      log(`${providerId}.resume.failed`, {
        discordThreadId: thread.id,
        error: formatError(error)
      });
    } finally {
      stopTyping();
      await attachments.cleanup();
    }
  }

  client.once("clientReady", () => {
    log(`${providerId}.discord.ready`, {
      botUserId: client.user?.id,
      botTag: client.user?.tag,
      workdir
    });
  });

  const slashCommands = getSlashCommands({ includeStatus: !!statusFetcher });

  client.once("clientReady", async () => {
    try {
      const result = await registerSlashCommands(client, discordGuildId, slashCommands);
      commandScope = result.scope;

      log(`${providerId}.discord.commands.registered`, result);
    } catch (error) {
      log(`${providerId}.discord.commands.failed`, {
        error: formatError(error),
        scope: discordGuildId ? "guild" : "global"
      });
    }
  });

  client.on("messageCreate", async (message) => {
    if (!message.inGuild()) {
      return;
    }

    if (!canProcessMessageAuthor(message.author, allowedBotIds)) {
      return;
    }

    if (message.author.bot && allowedBotIds.has(message.author.id)) {
      log(`${providerId}.discord.allowed_bot.message`, {
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
        `Please include a prompt after \`@${botName}\`. Optional syntax: \`@${botName} --model <name> your prompt\`. Images are supported when attached to the same message.`
      );
      return;
    }

    await acknowledgeRequest(message);

    log(`${providerId}.discord.mention.received`, {
      authorIsBot: message.author.bot,
      attachmentCount: message.attachments.size,
      messageId: message.id,
      channelId: message.channelId,
      hasAnyDiscordMention: hasAnyDiscordMention(message),
      isMentionForBot: isMentionForBot(message),
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
        log(`${providerId}.discord.reply.failed`, {
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
          content: buildHelpMessage({
            botName,
            includeStatus: !!statusFetcher,
            providerName
          }),
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      if (interaction.commandName === "status" && statusFetcher) {
        await interaction.deferReply({
          flags: MessageFlags.Ephemeral
        });

        const codexStatus = await statusFetcher();

        await interaction.editReply({
          content: buildStatusMessage({ codexStatus })
        });
        return;
      }
    } catch (error) {
      const content = `Command failed: ${formatError(error)}`;

      if (interaction.deferred && !interaction.replied) {
        await interaction.editReply({
          content
        });
        return;
      }

      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({
          content,
          flags: MessageFlags.Ephemeral
        });
        return;
      }

      await interaction.reply({
        content,
        flags: MessageFlags.Ephemeral
      });
    }
  });

  await client.login(botToken);

  return client;
}

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
