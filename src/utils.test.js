import test from "node:test";
import assert from "node:assert/strict";

import {
  buildTurnStatusMessage,
  buildThreadName,
  canProcessMessageAuthor,
  parseMentionCommand,
  splitDiscordMessage,
  splitDiscordMessageWithPrefix,
  stripLeadingDiscordMentions,
  stripBotMention
} from "./utils.js";

test("stripBotMention removes discord mention markup", () => {
  assert.equal(stripBotMention("<@123> hello", "123"), "hello");
  assert.equal(stripBotMention("<@!123> hello", "123"), "hello");
  assert.equal(stripBotMention("hello <@123>", "123"), "hello");
});

test("stripLeadingDiscordMentions removes leading discord mention markup", () => {
  assert.equal(stripLeadingDiscordMentions("<@&456> hello"), "hello");
  assert.equal(stripLeadingDiscordMentions("<@123> <@&456> <#789> hello"), "hello");
  assert.equal(stripLeadingDiscordMentions("@everyone hello"), "hello");
  assert.equal(stripLeadingDiscordMentions("hello <@&456>"), "hello <@&456>");
});

test("buildThreadName prefixes and truncates", () => {
  const name = buildThreadName("hello world");
  assert.equal(name, "codex: hello world");

  const longName = buildThreadName("x".repeat(200));
  assert.equal(longName.length, 100);
});

test("parseMentionCommand extracts a model flag", () => {
  assert.deepEqual(
    parseMentionCommand("<@123> --model gpt-5 explain this", "123"),
    { model: "gpt-5", prompt: "explain this" }
  );

  assert.deepEqual(
    parseMentionCommand("<@123> -m \"gpt-5-codex\" explain this", "123"),
    { model: "gpt-5-codex", prompt: "explain this" }
  );
});

test("parseMentionCommand leaves plain prompts unchanged", () => {
  assert.deepEqual(
    parseMentionCommand("<@123> hello there", "123"),
    { model: null, prompt: "hello there" }
  );
});

test("parseMentionCommand can parse after leading mentions are stripped", () => {
  assert.deepEqual(
    parseMentionCommand(stripLeadingDiscordMentions("<@&456> tell me a joke"), "123"),
    { model: null, prompt: "tell me a joke" }
  );
});

test("canProcessMessageAuthor allows humans and only whitelisted bots", () => {
  assert.equal(canProcessMessageAuthor({ bot: false, id: "human-1" }), true);
  assert.equal(canProcessMessageAuthor({ bot: true, id: "bot-1" }), false);
  assert.equal(canProcessMessageAuthor({ bot: true, id: "bot-1" }, new Set(["bot-1"])), true);
});

test("buildTurnStatusMessage explains new session behavior and usage", () => {
  const text = buildTurnStatusMessage({
    mode: "new",
    codexThreadId: "abc-123",
    imageCount: 1,
    model: null,
    usage: {
      input_tokens: 10564,
      cached_input_tokens: 5504,
      output_tokens: 27
    }
  });

  assert.match(text, /\*\*Codex Status\*\*/);
  assert.match(text, /started new Codex session/);
  assert.match(text, /discord context: current mention only/);
  assert.match(text, /images: 1 attached/);
  assert.match(text, /default \(no `-m` passed\)/);
  assert.match(text, /input 10,564 \| cached 5,504 \| output 27/);
});

test("buildTurnStatusMessage explains resumed session behavior", () => {
  const text = buildTurnStatusMessage({
    mode: "resume",
    codexThreadId: "abc-123",
    imageCount: 0,
    model: "gpt-5",
    usage: null
  });

  assert.match(text, /resumed existing Codex session/);
  assert.match(text, /discord context: current mention only; history via Codex session/);
  assert.match(text, /images: none/);
  assert.match(text, /model arg: `gpt-5`/);
  assert.match(text, /usage: unavailable/);
});

test("splitDiscordMessage splits long content into multiple chunks", () => {
  const longText = "a".repeat(2100);
  const chunks = splitDiscordMessage(longText);

  assert.equal(chunks.length, 2);
  assert.equal(chunks[0].length, 2000);
  assert.equal(chunks[1].length, 100);
});

test("splitDiscordMessageWithPrefix keeps the first chunk within Discord limits", () => {
  const prefix = "<@123>";
  const chunks = splitDiscordMessageWithPrefix(prefix, "a".repeat(2100));

  assert.equal(chunks.length, 2);
  assert.equal(chunks[0], `<@123>\n${"a".repeat(1993)}`);
  assert.equal(chunks[1], "a".repeat(107));
});
