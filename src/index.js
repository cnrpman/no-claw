import {
  Client,
  GatewayIntentBits,
  ThreadAutoArchiveDuration
} from "discord.js";

import { CodexClient } from "./codex.js";
import { loadConfig } from "./config.js";
import { SessionStore } from "./session-store.js";
import {
  buildTurnStatusMessage,
  buildThreadName,
  formatError,
  parseMentionCommand,
  splitDiscordMessage,
} from "./utils.js";

const config = loadConfig();
const sessionStore = new SessionStore(config.sessionStorePath);
const codex = new CodexClient(config);
const activeThreads = new Set();
const ACK_EMOJI = "👀";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

function log(message, details = {}) {
  const payload = Object.keys(details).length > 0 ? ` ${JSON.stringify(details)}` : "";
  console.log(`${new Date().toISOString()} ${message}${payload}`);
}

function isMentionForBot(message) {
  return client.user ? message.mentions.users.has(client.user.id) : false;
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

async function sendCodexResponse(thread, placeholderMessage, responseText) {
  const chunks = splitDiscordMessage(responseText);

  for (const chunk of chunks) {
    await thread.send(chunk);
  }
}

async function handleNewChannelMention(message, command) {
  const { model, prompt } = command;
  let thread;

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

  const placeholderMessage = await thread.send("Running Codex...");
  activeThreads.add(thread.id);

  log("codex.thread.created", {
    discordThreadId: thread.id,
    starterMessageId: message.id,
    userId: message.author.id
  });

  try {
    const result = await codex.createTurn({ prompt, model });
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

    await placeholderMessage.edit(
      buildTurnStatusMessage({
        mode: "new",
        codexThreadId: result.threadId,
        model,
        usage: result.usage
      })
    );
    await sendCodexResponse(thread, placeholderMessage, result.responseText);

    log("codex.turn.created", {
      discordThreadId: thread.id,
      codexThreadId: result.threadId,
      requestedModel: model
    });
  } catch (error) {
    await placeholderMessage.edit(`Codex request failed: ${formatError(error)}`);
    log("codex.turn.failed", {
      discordThreadId: thread.id,
      error: formatError(error)
    });
  } finally {
    activeThreads.delete(thread.id);
  }
}

async function handleThreadMention(message, command) {
  const { model, prompt } = command;
  const thread = message.channel;
  const session = sessionStore.get(thread.id);

  if (!session) {
    await message.reply("This thread is not connected to a Codex session. Start from a normal channel with `@codex`.");
    return;
  }

  if (activeThreads.has(thread.id)) {
    await message.reply("A Codex request is already running in this thread.");
    return;
  }

  const placeholderMessage = await thread.send("Running Codex...");
  activeThreads.add(thread.id);

  log("codex.thread.resuming", {
    discordThreadId: thread.id,
    codexThreadId: session.codexThreadId,
    userId: message.author.id
  });

  try {
    const result = await codex.resumeTurn({
      threadId: session.codexThreadId,
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

    await placeholderMessage.edit(
      buildTurnStatusMessage({
        mode: "resume",
        codexThreadId: result.threadId,
        model,
        usage: result.usage
      })
    );
    await sendCodexResponse(thread, placeholderMessage, result.responseText);

    log("codex.turn.resumed", {
      discordThreadId: thread.id,
      codexThreadId: result.threadId,
      requestedModel: model
    });
  } catch (error) {
    await placeholderMessage.edit(`Codex resume failed: ${formatError(error)}`);
    log("codex.resume.failed", {
      discordThreadId: thread.id,
      codexThreadId: session.codexThreadId,
      error: formatError(error)
    });
  } finally {
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

client.on("messageCreate", async (message) => {
  if (!message.inGuild()) {
    return;
  }

  if (message.author.bot) {
    return;
  }

  if (!isMentionForBot(message)) {
    return;
  }

  const command = parseMentionCommand(message.content, client.user.id);
  const prompt = command.prompt;

  if (!requirePrompt(prompt)) {
    await message.reply("Please include a prompt after `@codex`. Optional syntax: `@codex --model <name> your prompt`. Attachments are not supported yet.");
    return;
  }

  await acknowledgeRequest(message);

  log("discord.mention.received", {
    messageId: message.id,
    channelId: message.channelId,
    isThread: message.channel.isThread(),
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
      await message.reply(failure);
    } catch {
      log("discord.reply.failed", {
        messageId: message.id,
        error: failure
      });
    }
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
