import test from "node:test";
import assert from "node:assert/strict";

import { buildCodexCommandArgs } from "./codex.js";

test("buildCodexCommandArgs terminates options before a create prompt with images", () => {
  const args = buildCodexCommandArgs({
    args: ["exec"],
    imagePaths: ["/tmp/a.png", "/tmp/b.png"],
    model: "gpt-5",
    outputFile: "/tmp/out.txt",
    prompt: "describe this image"
  });

  assert.deepEqual(args, [
    "exec",
    "--skip-git-repo-check",
    "--json",
    "-o",
    "/tmp/out.txt",
    "-m",
    "gpt-5",
    "-i",
    "/tmp/a.png",
    "-i",
    "/tmp/b.png",
    "--",
    "describe this image"
  ]);
});

test("buildCodexCommandArgs terminates options before resume session id and prompt", () => {
  const args = buildCodexCommandArgs({
    args: ["exec", "resume"],
    imagePaths: ["/tmp/a.png"],
    model: null,
    outputFile: "/tmp/out.txt",
    prompt: "-- explain the image",
    threadId: "thread-123"
  });

  assert.deepEqual(args, [
    "exec",
    "resume",
    "--skip-git-repo-check",
    "--json",
    "-o",
    "/tmp/out.txt",
    "-i",
    "/tmp/a.png",
    "--",
    "thread-123",
    "-- explain the image"
  ]);
});
