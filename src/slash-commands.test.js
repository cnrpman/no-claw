import test from "node:test";
import assert from "node:assert/strict";

import {
  buildHelpMessage,
  buildStatusMessage
} from "./slash-commands.js";

test("buildHelpMessage lists mention syntax and slash commands", () => {
  const text = buildHelpMessage();

  assert.match(text, /@codex your prompt/);
  assert.match(text, /\/status/);
  assert.doesNotMatch(text, /\/usage/);
  assert.match(text, /do not consume model tokens/);
});

test("buildHelpMessage can describe the Claude bot", () => {
  const text = buildHelpMessage({
    botName: "claude",
    providerName: "Claude"
  });

  assert.match(text, /\*\*discord-claude help\*\*/);
  assert.match(text, /@claude your prompt/);
  assert.match(text, /continues the same Claude session/);
  assert.match(text, /do not call Claude/);
});

test("buildStatusMessage summarizes local runtime state", () => {
  const text = buildStatusMessage({
    activeRequestCount: 2,
    codexStatus: {
      timestamp: "2026-03-09T00:40:00.000Z",
      usageTimestamp: "2026-03-09T00:40:00.000Z",
      rateLimitTimestamp: "2026-03-09T00:40:00.000Z",
      info: {
        total_token_usage: {
          input_tokens: 5000,
          cached_input_tokens: 3000,
          output_tokens: 120
        },
        last_token_usage: {
          input_tokens: 100,
          cached_input_tokens: 50,
          output_tokens: 12
        }
      },
      rate_limits: {
        primary: {
          used_percent: 6,
          resets_at: 1773006261
        },
        secondary: {
          used_percent: 88,
          resets_at: 1773111024
        }
      }
    },
    codexCwd: "/tmp/workspace",
    commandScope: "guild",
    startedAt: new Date(Date.now() - 65_000),
    stats: {
      completedTurns: 3,
      lastTurnAt: "2026-03-09T00:40:00.000Z",
      lastTurnMode: "resume",
      lastTurnUsage: {
        input_tokens: 1200,
        cached_input_tokens: 800,
        output_tokens: 30
      },
      totalInputTokens: 1234,
      totalCachedInputTokens: 234,
      totalOutputTokens: 45
    },
    trackedThreadCount: 4
  });

  assert.match(text, /\*\*discord-codex status\*\*/);
  assert.match(text, /\*\*codex account\*\*/);
  assert.match(text, /5h limit: 94% left/);
  assert.match(text, /\*\*weekly limit: 12% left/);
  assert.ok(text.indexOf("**weekly limit: 12% left") < text.indexOf("5h limit: 94% left"));
  assert.match(text, /total usage: in 5,000 \| cached 3,000 \| out 120/);
  assert.match(text, /last usage: in 100 \| cached 50 \| out 12/);
  assert.match(text, /command scope: guild/);
  assert.match(text, /active requests: 2/);
  assert.match(text, /tracked threads: 4/);
  assert.match(text, /completed turns: 3/);
  assert.match(text, /codex cwd: `\/tmp\/workspace`/);
  assert.match(text, /bot-tracked usage: in 1,234 \| cached 234 \| out 45/);
  assert.match(text, /zero-token status assembled from local bot state and local Codex files/);
});

test("buildStatusMessage separates usage and limit snapshots when they come from different token_count events", () => {
  const text = buildStatusMessage({
    activeRequestCount: 0,
    codexStatus: {
      timestamp: "2026-03-09T00:40:00.000Z",
      usageTimestamp: "2026-03-09T00:40:00.000Z",
      rateLimitTimestamp: "2026-03-08T23:59:00.000Z",
      info: {
        total_token_usage: {
          input_tokens: 200,
          cached_input_tokens: 100,
          output_tokens: 20
        },
        last_token_usage: {
          input_tokens: 20,
          cached_input_tokens: 10,
          output_tokens: 2
        }
      },
      rate_limits: {
        primary: {
          used_percent: 25,
          resets_at: 1773000000
        },
        secondary: {
          used_percent: 50,
          resets_at: 1773600000
        }
      }
    },
    codexCwd: "/tmp/workspace",
    commandScope: "guild",
    startedAt: new Date(Date.now() - 1_000),
    stats: {
      completedTurns: 0,
      lastTurnAt: null,
      lastTurnMode: null,
      lastTurnUsage: null,
      totalInputTokens: 0,
      totalCachedInputTokens: 0,
      totalOutputTokens: 0
    },
    trackedThreadCount: 0
  });

  assert.match(text, /usage snapshot: 2026-03-09T00:40:00.000Z/);
  assert.match(text, /limit snapshot: 2026-03-08T23:59:00.000Z/);
});

test("buildStatusMessage can describe Claude without local account usage", () => {
  const text = buildStatusMessage({
    activeRequestCount: 1,
    botName: "claude",
    commandScope: "global",
    cwd: "/tmp/claude-workspace",
    providerName: "Claude",
    startedAt: new Date(Date.now() - 10_000),
    stats: {
      completedTurns: 1,
      lastTurnAt: "2026-03-09T00:40:00.000Z",
      lastTurnMode: "new",
      lastTurnUsage: {
        input_tokens: 10,
        cached_input_tokens: null,
        output_tokens: 5
      },
      totalInputTokens: 10,
      totalCachedInputTokens: 0,
      totalOutputTokens: 5
    },
    trackedThreadCount: 1
  });

  assert.match(text, /\*\*discord-claude status\*\*/);
  assert.match(text, /\*\*claude account\*\*/);
  assert.match(text, /status: unavailable/);
  assert.match(text, /claude cwd: `\/tmp\/claude-workspace`/);
  assert.match(text, /local Claude account usage is not implemented/);
});
