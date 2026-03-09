import test from "node:test";
import assert from "node:assert/strict";

import {
  buildHelpMessage,
  buildStatusMessage,
  getSlashCommands
} from "./slash-commands.js";

test("getSlashCommands returns only help by default", () => {
  const commands = getSlashCommands();

  assert.equal(commands.length, 1);
  assert.equal(commands[0].name, "help");
});

test("getSlashCommands includes status when requested", () => {
  const commands = getSlashCommands({ includeStatus: true });

  assert.equal(commands.length, 2);
  assert.equal(commands[0].name, "help");
  assert.equal(commands[1].name, "status");
});

test("buildHelpMessage lists mention syntax and slash commands", () => {
  const text = buildHelpMessage();

  assert.match(text, /@codex your prompt/);
  assert.doesNotMatch(text, /\/status/);
  assert.match(text, /do not consume model tokens/);
});

test("buildHelpMessage includes /status when includeStatus is true", () => {
  const text = buildHelpMessage({ includeStatus: true });

  assert.match(text, /\/status/);
});

test("buildHelpMessage can describe the Claude bot without /status", () => {
  const text = buildHelpMessage({
    botName: "claude",
    providerName: "Claude"
  });

  assert.match(text, /\*\*discord-claude help\*\*/);
  assert.match(text, /@claude your prompt/);
  assert.match(text, /continues the same Claude session/);
  assert.match(text, /do not call Claude/);
  assert.doesNotMatch(text, /\/status/);
});

test("buildStatusMessage shows 5h and weekly limits", () => {
  const text = buildStatusMessage({
    codexStatus: {
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
    }
  });

  assert.match(text, /\*\*weekly limit: 12% left/);
  assert.match(text, /5h limit: 94% left/);
  assert.ok(text.indexOf("**weekly limit") < text.indexOf("5h limit"));
});

test("buildStatusMessage returns unavailable when codexStatus is null", () => {
  const text = buildStatusMessage({ codexStatus: null });

  assert.match(text, /unavailable/);
});
