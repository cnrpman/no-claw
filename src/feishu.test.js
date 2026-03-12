import test from "node:test";
import assert from "node:assert/strict";

import {
  buildFeishuSessionKey,
  parseFeishuTextContent,
  shouldHandleFeishuMessage,
  stripFeishuMentionPlaceholders
} from "./feishu.js";

test("parseFeishuTextContent extracts text from Feishu message content", () => {
  assert.equal(parseFeishuTextContent(JSON.stringify({ text: "hello world" })), "hello world");
  assert.equal(parseFeishuTextContent("{"), "");
});

test("stripFeishuMentionPlaceholders removes leading Feishu mention placeholders", () => {
  assert.equal(stripFeishuMentionPlaceholders("@_user_1 hello there"), "hello there");
  assert.equal(stripFeishuMentionPlaceholders("@_user_1 @_user_2   hello there"), "hello there");
});

test("buildFeishuSessionKey prefers root_id over other identifiers", () => {
  const key = buildFeishuSessionKey({
    chat_id: "oc_chat_1",
    chat_type: "group",
    message_id: "om_message_1",
    root_id: "om_root_1",
    thread_id: "omt_thread_1"
  });

  assert.equal(key, "feishu:oc_chat_1:root:om_root_1");
});

test("buildFeishuSessionKey uses thread_id when root_id is absent", () => {
  const key = buildFeishuSessionKey({
    chat_id: "oc_chat_1",
    chat_type: "group",
    message_id: "om_message_1",
    thread_id: "omt_thread_1"
  });

  assert.equal(key, "feishu:oc_chat_1:thread:omt_thread_1");
});

test("buildFeishuSessionKey uses chat_id for p2p chats", () => {
  const key = buildFeishuSessionKey({
    chat_id: "oc_chat_1",
    chat_type: "p2p",
    message_id: "om_message_1"
  });

  assert.equal(key, "feishu:oc_chat_1");
});

test("buildFeishuSessionKey falls back to the current message id for new group turns", () => {
  const key = buildFeishuSessionKey({
    chat_id: "oc_chat_1",
    chat_type: "group",
    message_id: "om_message_1"
  });

  assert.equal(key, "feishu:oc_chat_1:root:om_message_1");
});

test("shouldHandleFeishuMessage always handles p2p chats", () => {
  assert.equal(
    shouldHandleFeishuMessage({
      hasSession: false,
      message: {
        chat_type: "p2p"
      }
    }),
    true
  );
});

test("shouldHandleFeishuMessage requires mention or existing session in group chats", () => {
  assert.equal(
    shouldHandleFeishuMessage({
      hasSession: false,
      message: {
        chat_type: "group",
        mentions: []
      }
    }),
    false
  );
  assert.equal(
    shouldHandleFeishuMessage({
      hasSession: false,
      message: {
        chat_type: "group",
        mentions: [{}]
      }
    }),
    true
  );
  assert.equal(
    shouldHandleFeishuMessage({
      hasSession: true,
      message: {
        chat_type: "group",
        mentions: []
      }
    }),
    true
  );
});
