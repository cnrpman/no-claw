import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { SessionStore } from "./session-store.js";
import {
  SessionNotFoundError,
  TurnBusyError,
  TurnOrchestrator
} from "./turn-orchestrator.js";

async function createStore() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "no-claw-orchestrator-"));
  const store = new SessionStore(path.join(root, "sessions.json"));
  await store.load();
  return { root, store };
}

test("TurnOrchestrator creates and persists a new session", async () => {
  const { root, store } = await createStore();
  const orchestrator = new TurnOrchestrator({
    providerClient: {
      async createTurn() {
        return {
          responseText: "hello",
          threadId: "provider-session-1",
          usage: { input_tokens: 1, cached_input_tokens: 0, output_tokens: 2 }
        };
      }
    },
    providerId: "codex",
    sessionStore: store
  });

  const result = await orchestrator.runTurn({
    mode: "new",
    platformConversationId: "discord-thread-1",
    platformId: "discord",
    prompt: "hello",
    sessionKey: "discord-thread-1",
    userId: "user-1"
  });

  assert.equal(result.mode, "new");
  assert.equal(result.sessionId, "provider-session-1");
  assert.equal(store.get("discord-thread-1").providerSessionId, "provider-session-1");
  assert.equal(store.getStats().lastTurnSessionKey, "discord-thread-1");

  await fs.rm(root, { recursive: true, force: true });
});

test("TurnOrchestrator auto mode resumes an existing session", async () => {
  const { root, store } = await createStore();
  await store.upsert({
    createdAt: "2026-03-12T00:00:00.000Z",
    createdByUserId: "user-1",
    platformConversationId: "feishu:chat-1",
    platformId: "feishu",
    providerId: "claude",
    providerSessionId: "claude-session-1",
    sessionKey: "feishu:chat-1"
  });

  const calls = [];
  const orchestrator = new TurnOrchestrator({
    providerClient: {
      async createTurn() {
        calls.push("create");
        return {
          responseText: "new",
          threadId: "new-session"
        };
      },
      async resumeTurn({ threadId, prompt }) {
        calls.push({ threadId, prompt });
        return {
          responseText: "resumed",
          threadId
        };
      }
    },
    providerId: "claude",
    sessionStore: store
  });

  const result = await orchestrator.runTurn({
    mode: "auto",
    platformConversationId: "feishu:chat-1",
    platformId: "feishu",
    prompt: "continue",
    sessionKey: "feishu:chat-1",
    userId: "user-1"
  });

  assert.equal(result.mode, "resume");
  assert.deepEqual(calls, [{ threadId: "claude-session-1", prompt: "continue" }]);

  await fs.rm(root, { recursive: true, force: true });
});

test("TurnOrchestrator throws SessionNotFoundError for resume without an existing session", async () => {
  const { root, store } = await createStore();
  const orchestrator = new TurnOrchestrator({
    providerClient: {},
    providerId: "codex",
    sessionStore: store
  });

  await assert.rejects(
    () => orchestrator.runTurn({
      mode: "resume",
      platformConversationId: "thread-1",
      platformId: "discord",
      prompt: "hello",
      sessionKey: "thread-1",
      userId: "user-1"
    }),
    SessionNotFoundError
  );

  await fs.rm(root, { recursive: true, force: true });
});

test("TurnOrchestrator throws TurnBusyError when the same session is already active", async () => {
  const { root, store } = await createStore();
  const orchestrator = new TurnOrchestrator({
    providerClient: {
      async createTurn() {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return {
          responseText: "hello",
          threadId: "provider-session-1"
        };
      }
    },
    providerId: "codex",
    sessionStore: store
  });

  const first = orchestrator.runTurn({
    mode: "new",
    platformConversationId: "thread-1",
    platformId: "discord",
    prompt: "hello",
    sessionKey: "thread-1",
    userId: "user-1"
  });

  await assert.rejects(
    () => orchestrator.runTurn({
      mode: "resume",
      platformConversationId: "thread-1",
      platformId: "discord",
      prompt: "hello again",
      sessionKey: "thread-1",
      userId: "user-1"
    }),
    TurnBusyError
  );

  await first;
  await fs.rm(root, { recursive: true, force: true });
});
