import { spawn } from "node:child_process";

function parseJsonLine(line) {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

function collectClaudeErrorCandidates(event) {
  if (!event || typeof event !== "object") {
    return [];
  }

  const candidates = [];
  const maybePush = (value) => {
    if (typeof value === "string" && value.trim()) {
      candidates.push(value.trim());
    }
  };

  maybePush(event.message);
  maybePush(event.error);
  maybePush(event.error?.message);
  maybePush(event.result);
  maybePush(event.details);

  return candidates;
}

export function extractClaudeFailureDetails({ stderr, stdoutLines }) {
  const candidates = [];

  for (let index = stdoutLines.length - 1; index >= 0; index -= 1) {
    const event = parseJsonLine(stdoutLines[index]);

    if (event?.type === "result" && event?.subtype === "error" && event?.error) {
      return event.error;
    }

    if (event) {
      candidates.push(...collectClaudeErrorCandidates(event));
      continue;
    }

    const line = String(stdoutLines[index] || "").trim();

    if (line) {
      candidates.push(line);
    }
  }

  const stderrText = String(stderr || "").trim();

  if (candidates.length > 0) {
    return candidates[0];
  }

  if (stderrText) {
    const lines = stderrText.split(/\r?\n/).filter((line) => line.trim());
    return lines[lines.length - 1] || stderrText;
  }

  return "Unknown Claude failure";
}

export function buildClaudeCommandArgs({
  imagePaths = [],
  model = null,
  prompt,
  sessionId = null
}) {
  const args = ["--verbose", "--output-format", "stream-json", "--print"];

  if (model) {
    args.push("--model", model);
  }

  if (sessionId) {
    args.push("--resume", sessionId);
  }

  let effectivePrompt = prompt;

  if (imagePaths.length > 0) {
    const refs = imagePaths.map((filePath) => `[Attached image: ${filePath}]`).join("\n");
    effectivePrompt = `${refs}\n\n${prompt}`;
  }

  args.push(effectivePrompt);

  return args;
}

export class ClaudeClient {
  constructor({ claudeBin, claudeCwd }) {
    this.claudeBin = claudeBin;
    this.claudeCwd = claudeCwd;
  }

  async createTurn({ prompt, model = null, imagePaths = [] }) {
    return this.#run({ prompt, model, imagePaths });
  }

  async resumeTurn({ threadId, prompt, model = null, imagePaths = [] }) {
    return this.#run({ prompt, model, imagePaths, sessionId: threadId });
  }

  async #run({ prompt, model = null, imagePaths = [], sessionId = null }) {
    const commandArgs = buildClaudeCommandArgs({
      imagePaths,
      model,
      prompt,
      sessionId
    });

    const stdoutLines = [];
    const stderrChunks = [];
    let stdoutBuffer = "";

    const result = await new Promise((resolve, reject) => {
      const child = spawn(this.claudeBin, commandArgs, {
        cwd: this.claudeCwd,
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"]
      });

      child.on("error", reject);

      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk) => {
        stdoutBuffer += chunk;

        while (true) {
          const newlineIndex = stdoutBuffer.indexOf("\n");

          if (newlineIndex === -1) {
            break;
          }

          const line = stdoutBuffer.slice(0, newlineIndex).trim();
          stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);

          if (line) {
            stdoutLines.push(line);
          }
        }
      });

      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (chunk) => {
        stderrChunks.push(chunk);
      });

      child.on("close", (code) => {
        const trailingLine = stdoutBuffer.trim();

        if (trailingLine) {
          stdoutLines.push(trailingLine);
        }

        resolve({
          code,
          stdoutLines,
          stderr: stderrChunks.join("")
        });
      });
    });

    if (result.code !== 0) {
      const details = extractClaudeFailureDetails({
        stderr: result.stderr,
        stdoutLines: result.stdoutLines
      });
      throw new Error(details);
    }

    let discoveredSessionId = sessionId;
    let responseText = "";
    let usage = null;

    for (const line of result.stdoutLines) {
      try {
        const event = JSON.parse(line);

        if (event.type === "system" && event.session_id) {
          discoveredSessionId = event.session_id;
        }

        if (event.type === "assistant" && event.message?.content) {
          for (const block of event.message.content) {
            if (block.type === "text") {
              responseText = block.text;
            }
          }
        }

        if (event.type === "result") {
          if (event.session_id) {
            discoveredSessionId = event.session_id;
          }

          if (event.result) {
            responseText = event.result;
          }

          if (event.input_tokens != null || event.output_tokens != null) {
            usage = {
              input_tokens: event.input_tokens ?? null,
              output_tokens: event.output_tokens ?? null,
              cached_input_tokens: null
            };
          }
        }
      } catch {
        continue;
      }
    }

    if (!discoveredSessionId) {
      throw new Error("Claude did not return a session id.");
    }

    if (!responseText) {
      throw new Error("Claude did not return a response.");
    }

    return {
      threadId: discoveredSessionId,
      responseText,
      usage
    };
  }
}
