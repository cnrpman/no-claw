import { randomUUID } from "node:crypto";

import * as Lark from "@larksuiteoapi/node-sdk";

import {
  buildTurnStatusMessage,
  formatError,
  parsePromptCommand,
  splitTextMessage
} from "./utils.js";
import {
  SessionNotFoundError,
  TurnBusyError
} from "./turn-orchestrator.js";

const FEISHU_MESSAGE_LIMIT = 2000;
const EVENT_CACHE_TTL_MS = 10 * 60 * 1000;
const FEISHU_ACK_REACTION_TYPE = "GLANCE";

function log(message, details = {}) {
  const payload = Object.keys(details).length > 0 ? ` ${JSON.stringify(details)}` : "";
  console.log(`${new Date().toISOString()} ${message}${payload}`);
}

function createTextContent(text) {
  return JSON.stringify({ text });
}

export function buildFeishuAckReactionPayload(messageId) {
  return {
    data: {
      reaction_type: {
        // Feishu does not expose a Discord-style eyes reaction, so use the closest built-in glance emoji.
        emoji_type: FEISHU_ACK_REACTION_TYPE
      }
    },
    path: {
      message_id: messageId
    }
  };
}

function rememberEvent(cache, eventId) {
  if (!eventId) {
    return true;
  }

  const now = Date.now();
  const expiresAt = cache.get(eventId);

  if (typeof expiresAt === "number" && expiresAt > now) {
    return false;
  }

  const nextExpiry = now + EVENT_CACHE_TTL_MS;
  cache.set(eventId, nextExpiry);
  const timer = setTimeout(() => {
    if (cache.get(eventId) === nextExpiry) {
      cache.delete(eventId);
    }
  }, EVENT_CACHE_TTL_MS);

  timer.unref?.();
  return true;
}

export function parseFeishuTextContent(content) {
  try {
    const parsed = JSON.parse(String(content || ""));
    return typeof parsed?.text === "string" ? parsed.text : "";
  } catch {
    return "";
  }
}

export function stripFeishuMentionPlaceholders(text) {
  return String(text || "")
    .replace(/@_user_\d+\s*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildFeishuSessionKey(message) {
  const chatId = message.chat_id;

  if (message.root_id) {
    return `feishu:${chatId}:root:${message.root_id}`;
  }

  if (message.thread_id) {
    return `feishu:${chatId}:thread:${message.thread_id}`;
  }

  if (message.chat_type === "p2p") {
    return `feishu:${chatId}`;
  }

  return `feishu:${chatId}:root:${message.message_id}`;
}

export function shouldHandleFeishuMessage({ hasSession = false, message }) {
  if (message.chat_type === "p2p") {
    return true;
  }

  const isMentioned = Array.isArray(message.mentions) && message.mentions.length > 0;
  return hasSession || isMentioned;
}

function buildFeishuContextValue({ chatType, mode }) {
  if (mode === "resume") {
    return chatType === "p2p"
      ? "current chat message only; history via provider session"
      : "current thread message only; history via provider session";
  }

  return chatType === "p2p" ? "current chat message only" : "current message only";
}

function getSenderId(sender) {
  return sender?.sender_id?.open_id ?? sender?.sender_id?.user_id ?? sender?.sender_id?.union_id ?? "unknown";
}

function shouldReplyInThread(message) {
  return message.chat_type !== "p2p";
}

async function sendFeishuTextReply({
  client,
  message,
  text
}) {
  const chunks = splitTextMessage(text, FEISHU_MESSAGE_LIMIT);

  for (const chunk of chunks) {
    await client.im.v1.message.reply({
      data: {
        content: createTextContent(chunk),
        msg_type: "text",
        reply_in_thread: shouldReplyInThread(message),
        uuid: randomUUID()
      },
      path: {
        message_id: message.message_id
      }
    });
  }
}

async function acknowledgeFeishuRequest({
  chatId,
  client,
  messageId,
  providerId
}) {
  try {
    await client.im.v1.messageReaction.create(buildFeishuAckReactionPayload(messageId));
  } catch (error) {
    log(`${providerId}.feishu.react.failed`, {
      chatId,
      error: formatError(error),
      messageId,
      reactionType: FEISHU_ACK_REACTION_TYPE
    });
  }
}

export async function startFeishuBot({
  appId,
  appSecret,
  botName,
  orchestrator,
  providerId,
  providerName,
  sessionIdLabel,
  workdir
}) {
  const client = new Lark.Client({
    appId,
    appSecret,
    domain: Lark.Domain.Feishu
  });
  const wsClient = new Lark.WSClient({
    appId,
    appSecret,
    domain: Lark.Domain.Feishu,
    loggerLevel: Lark.LoggerLevel.info
  });
  const seenEventIds = new Map();

  async function handleIncomingMessage(data) {
    const { message, sender } = data;
    const senderId = getSenderId(sender);
    const sessionKey = buildFeishuSessionKey(message);

    if (sender?.sender_type !== "user") {
      return;
    }

    if (!shouldHandleFeishuMessage({
      hasSession: orchestrator.hasSession(sessionKey),
      message
    })) {
      log(`${providerId}.feishu.message.ignored`, {
        chatId: message.chat_id,
        messageId: message.message_id,
        reason: "group message without mention or existing session"
      });
      return;
    }

    log(`${providerId}.feishu.message.received`, {
      chatId: message.chat_id,
      chatType: message.chat_type,
      eventId: data.event_id,
      messageId: message.message_id,
      messageType: message.message_type,
      senderId,
      threadId: message.thread_id ?? null
    });

    if (message.message_type !== "text") {
      await sendFeishuTextReply({
        client,
        message,
        text: `${providerName} on Feishu currently supports text messages only.`
      });
      return;
    }

    const promptText = stripFeishuMentionPlaceholders(parseFeishuTextContent(message.content));
    const command = parsePromptCommand(promptText);

    if (!command.prompt) {
      await sendFeishuTextReply({
        client,
        message,
        text: `Please include a prompt for ${botName}. Optional syntax: \`--model <name> your prompt\`.`
      });
      return;
    }

    await acknowledgeFeishuRequest({
      chatId: message.chat_id,
      client,
      messageId: message.message_id,
      providerId
    });

    try {
      const result = await orchestrator.runTurn({
        mode: "auto",
        model: command.model,
        platformConversationId: sessionKey,
        platformId: "feishu",
        platformMessageId: message.message_id,
        platformParentId: message.chat_id,
        prompt: command.prompt,
        sessionKey,
        userId: senderId
      });

      await sendFeishuTextReply({
        client,
        message,
        text: buildTurnStatusMessage({
          contextLabel: "feishu context",
          contextValue: buildFeishuContextValue({
            chatType: message.chat_type,
            mode: result.mode
          }).replace("provider session", `${providerName} session`),
          imageCount: 0,
          mode: result.mode,
          model: command.model,
          providerName,
          sessionId: result.sessionId,
          sessionIdLabel,
          usage: result.usage
        })
      });

      await sendFeishuTextReply({
        client,
        message,
        text: result.responseText
      });

      log(`${providerId}.feishu.turn.completed`, {
        chatId: message.chat_id,
        messageId: message.message_id,
        mode: result.mode,
        providerSessionId: result.sessionId
      });
    } catch (error) {
      const failureText =
        error instanceof TurnBusyError
          ? `A ${providerName} request is already running for this conversation.`
          : error instanceof SessionNotFoundError
            ? `This conversation is not connected to a ${providerName} session yet.`
            : `${providerName} request failed: ${formatError(error)}`;

      await sendFeishuTextReply({
        client,
        message,
        text: failureText
      });

      log(`${providerId}.feishu.turn.failed`, {
        chatId: message.chat_id,
        error: formatError(error),
        messageId: message.message_id
      });
    }
  }

  const eventDispatcher = new Lark.EventDispatcher({}).register({
    "im.message.receive_v1": async (data) => {
      if (!rememberEvent(seenEventIds, data.event_id ?? data.message?.message_id)) {
        return;
      }

      void handleIncomingMessage(data).catch((error) => {
        log(`${providerId}.feishu.handler.failed`, {
          error: formatError(error),
          eventId: data.event_id,
          messageId: data.message?.message_id
        });
      });
    }
  });

  await wsClient.start({ eventDispatcher });

  log(`${providerId}.feishu.ready`, {
    appId,
    workdir
  });

  return wsClient;
}
