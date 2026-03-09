import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCodexCommandArgs,
  extractCodexFailureDetails
} from "./codex.js";

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

test("extractCodexFailureDetails prefers a useful stdout error over stderr warnings", () => {
  const details = extractCodexFailureDetails({
    stderr: "Warning: no last agent message; wrote empty content to /tmp/out.txt\n",
    stdoutLines: [
      "OpenAI Codex v0.111.0 (research preview)",
      "--------",
      "workdir: /Users/jun/git/discord-codex",
      "session id: 019cd13a-249f-78e3-b379-8489fa9dfcdf",
      "user",
      "hello",
      "mcp startup: no servers",
      "ERROR: You've hit your usage limit. To get more access now, send a request to your admin or try again at Mar 10th, 2026 10:50 AM."
    ]
  });

  assert.equal(
    details,
    "ERROR: You've hit your usage limit. To get more access now, send a request to your admin or try again at Mar 10th, 2026 10:50 AM."
  );
});

test("extractCodexFailureDetails reads structured JSON error messages", () => {
  const details = extractCodexFailureDetails({
    stderr: "",
    stdoutLines: [JSON.stringify({ type: "error", error: { message: "Upstream request failed." } })]
  });

  assert.equal(details, "Upstream request failed.");
});
