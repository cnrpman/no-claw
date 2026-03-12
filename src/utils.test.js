import test from "node:test";
import assert from "node:assert/strict";

import {
  buildTurnStatusMessage,
  buildThreadName,
  canProcessMessageAuthor,
  parseMentionCommand,
  parsePromptCommand,
  splitDiscordMessage,
  splitTextMessage,
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

  const claudeName = buildThreadName("hello world", "claude");
  assert.equal(claudeName, "claude: hello world");

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

test("parsePromptCommand extracts a model flag without platform mention handling", () => {
  assert.deepEqual(
    parsePromptCommand("--model sonnet review this"),
    { model: "sonnet", prompt: "review this" }
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
  assert.match(text, /context: current message only/);
  assert.match(text, /images: 1 attached/);
  assert.match(text, /default \(no `-m` passed\)/);
  assert.match(text, /input 10,564 \| cached 5,504 \| output 27/);
});

test("buildTurnStatusMessage explains resumed session behavior", () => {
  const text = buildTurnStatusMessage({
    mode: "resume",
    sessionId: "abc-123",
    imageCount: 0,
    model: "gpt-5",
    providerName: "Claude",
    sessionIdLabel: "claude session",
    usage: null
  });

  assert.match(text, /\*\*Claude Status\*\*/);
  assert.match(text, /resumed existing Claude session/);
  assert.match(text, /context: current message only; history via Claude session/);
  assert.match(text, /images: none/);
  assert.match(text, /model arg: `gpt-5`/);
  assert.match(text, /claude session: `abc-123`/);
  assert.match(text, /usage: unavailable/);
});

test("buildTurnStatusMessage allows platform-specific context labels", () => {
  const text = buildTurnStatusMessage({
    mode: "resume",
    sessionId: "session-1",
    providerName: "Codex",
    sessionIdLabel: "codex thread",
    contextLabel: "feishu context",
    contextValue: "current thread only; history via Codex session"
  });

  assert.match(text, /feishu context: current thread only; history via Codex session/);
});

test("splitDiscordMessage splits long content into multiple chunks", () => {
  const longText = "a".repeat(2100);
  const chunks = splitDiscordMessage(longText);

  assert.equal(chunks.length, 2);
  assert.equal(chunks[0].length, 2000);
  assert.equal(chunks[1].length, 100);
});

test("splitTextMessage splits long content into chunks", () => {
  const chunks = splitTextMessage("a".repeat(2005), 1000);

  assert.deepEqual(chunks, ["a".repeat(1000), "a".repeat(1000), "a".repeat(5)]);
});

test("splitDiscordMessageWithPrefix keeps the first chunk within Discord limits", () => {
  const prefix = "<@123>";
  const chunks = splitDiscordMessageWithPrefix(prefix, "a".repeat(2100));

  assert.equal(chunks.length, 2);
  assert.equal(chunks[0], `<@123>\n${"a".repeat(1993)}`);
  assert.equal(chunks[1], "a".repeat(107));
});
