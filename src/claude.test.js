import test from "node:test";
import assert from "node:assert/strict";

import {
  buildClaudeCommandArgs,
  extractClaudeFailureDetails
} from "./claude.js";

test("buildClaudeCommandArgs adds model and resume session id", () => {
  const args = buildClaudeCommandArgs({
    imagePaths: [],
    model: "sonnet",
    prompt: "explain this",
    sessionId: "session-123"
  });

  assert.deepEqual(args, [
    "--verbose",
    "--output-format",
    "stream-json",
    "--print",
    "--model",
    "sonnet",
    "--resume",
    "session-123",
    "--",
    "explain this"
  ]);
});

test("buildClaudeCommandArgs adds --add-dir and prefixes image references into the prompt", () => {
  const args = buildClaudeCommandArgs({
    imagePaths: ["/tmp/imgs/a.png", "/tmp/imgs/b.png"],
    prompt: "what is in these images?"
  });

  assert.deepEqual(args, [
    "--verbose",
    "--output-format",
    "stream-json",
    "--print",
    "--add-dir",
    "/tmp/imgs",
    "--",
    "[Attached image: /tmp/imgs/a.png]\n[Attached image: /tmp/imgs/b.png]\n\nwhat is in these images?"
  ]);
});

test("extractClaudeFailureDetails falls back to stdout text before stderr", () => {
  const details = extractClaudeFailureDetails({
    stderr: "wrapper stderr\n",
    stdoutLines: ["Claude usage limit reached. Try again later."]
  });

  assert.equal(details, "Claude usage limit reached. Try again later.");
});

test("extractClaudeFailureDetails prefers structured result errors", () => {
  const details = extractClaudeFailureDetails({
    stderr: "",
    stdoutLines: [JSON.stringify({
      type: "result",
      subtype: "error",
      error: "Claude request failed"
    })]
  });

  assert.equal(details, "Claude request failed");
});

test("extractClaudeFailureDetails falls back to stderr", () => {
  const details = extractClaudeFailureDetails({
    stderr: "warning\nreal stderr failure\n",
    stdoutLines: []
  });

  assert.equal(details, "real stderr failure");
});