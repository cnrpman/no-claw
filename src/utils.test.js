import test from "node:test";
import assert from "node:assert/strict";

import {
  buildTurnStatusMessage,
  buildThreadName,
  parseMentionCommand,
  splitDiscordMessage,
  stripBotMention
} from "./utils.js";

test("stripBotMention removes discord mention markup", () => {
  assert.equal(stripBotMention("<@123> hello", "123"), "hello");
  assert.equal(stripBotMention("<@!123> hello", "123"), "hello");
  assert.equal(stripBotMention("hello <@123>", "123"), "hello");
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

test("buildTurnStatusMessage explains new session behavior and usage", () => {
  const text = buildTurnStatusMessage({
    mode: "new",
    codexThreadId: "abc-123",
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
  assert.match(text, /default \(no `-m` passed\)/);
  assert.match(text, /input 10,564 \| cached 5,504 \| output 27/);
});

test("buildTurnStatusMessage explains resumed session behavior", () => {
  const text = buildTurnStatusMessage({
    mode: "resume",
    codexThreadId: "abc-123",
    model: "gpt-5",
    usage: null
  });

  assert.match(text, /resumed existing Codex session/);
  assert.match(text, /discord context: current mention only; history via Codex session/);
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
