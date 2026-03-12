import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { getLatestCodexStatus } from "./codex-status.js";

test("getLatestCodexStatus returns the newest token_count event from recent session files", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "no-claw-status-"));
  const olderDir = path.join(root, "2026", "03", "08");
  const newerDir = path.join(root, "2026", "03", "09");

  await fs.mkdir(olderDir, { recursive: true });
  await fs.mkdir(newerDir, { recursive: true });

  const olderFile = path.join(olderDir, "older.jsonl");
  const newerFile = path.join(newerDir, "newer.jsonl");

  await fs.writeFile(
    olderFile,
    [
      JSON.stringify({
        timestamp: "2026-03-08T10:00:00.000Z",
        type: "event_msg",
        payload: {
          type: "token_count",
          info: {
            total_token_usage: {
              input_tokens: 100,
              cached_input_tokens: 50,
              output_tokens: 10
            },
            last_token_usage: {
              input_tokens: 10,
              cached_input_tokens: 5,
              output_tokens: 1
            }
          },
          rate_limits: {
            primary: {
              used_percent: 20,
              resets_at: 1773000000
            },
            secondary: {
              used_percent: 30,
              resets_at: 1773600000
            }
          }
        }
      })
    ].join("\n"),
    "utf8"
  );

  await fs.writeFile(
    newerFile,
    [
      JSON.stringify({
        timestamp: "2026-03-09T10:00:00.000Z",
        type: "event_msg",
        payload: {
          type: "token_count",
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
              used_percent: 40,
              resets_at: 1773001000
            },
            secondary: {
              used_percent: 60,
              resets_at: 1773601000
            }
          }
        }
      })
    ].join("\n"),
    "utf8"
  );

  const status = await getLatestCodexStatus(root);

  assert.equal(status.timestamp, "2026-03-09T10:00:00.000Z");
  assert.equal(status.usageTimestamp, "2026-03-09T10:00:00.000Z");
  assert.equal(status.rateLimitTimestamp, "2026-03-09T10:00:00.000Z");
  assert.equal(status.info.total_token_usage.input_tokens, 200);
  assert.equal(status.rate_limits.primary.used_percent, 40);

  await fs.rm(root, { recursive: true, force: true });
});

test("getLatestCodexStatus falls back to the newest non-null rate limits when the newest usage event omits them", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "no-claw-status-"));
  const olderDir = path.join(root, "2026", "03", "08");
  const newerDir = path.join(root, "2026", "03", "09");

  await fs.mkdir(olderDir, { recursive: true });
  await fs.mkdir(newerDir, { recursive: true });

  const olderFile = path.join(olderDir, "older.jsonl");
  const newerFile = path.join(newerDir, "newer.jsonl");

  await fs.writeFile(
    olderFile,
    [
      JSON.stringify({
        timestamp: "2026-03-08T23:59:00.000Z",
        type: "event_msg",
        payload: {
          type: "token_count",
          info: {
            total_token_usage: {
              input_tokens: 100,
              cached_input_tokens: 50,
              output_tokens: 10
            },
            last_token_usage: {
              input_tokens: 10,
              cached_input_tokens: 5,
              output_tokens: 1
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
        }
      })
    ].join("\n"),
    "utf8"
  );

  await fs.writeFile(
    newerFile,
    [
      JSON.stringify({
        timestamp: "2026-03-09T00:00:00.000Z",
        type: "event_msg",
        payload: {
          type: "token_count",
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
          rate_limits: null
        }
      })
    ].join("\n"),
    "utf8"
  );

  const status = await getLatestCodexStatus(root);

  assert.equal(status.timestamp, "2026-03-09T00:00:00.000Z");
  assert.equal(status.usageTimestamp, "2026-03-09T00:00:00.000Z");
  assert.equal(status.rateLimitTimestamp, "2026-03-08T23:59:00.000Z");
  assert.equal(status.info.total_token_usage.input_tokens, 200);
  assert.equal(status.rate_limits.primary.used_percent, 25);

  await fs.rm(root, { recursive: true, force: true });
});
