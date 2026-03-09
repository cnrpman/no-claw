import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

function parseJsonLine(line) {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

function isCodexCliNoise(line) {
  return /^(?:-+|OpenAI Codex v|workdir:|model:|provider:|approval:|sandbox:|reasoning effort:|reasoning summaries:|session id:|user|mcp startup:)/i.test(line);
}

function collectEventErrorCandidates(event) {
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
  maybePush(event.detail);
  maybePush(event.error);
  maybePush(event.error?.message);
  maybePush(event.details);
  maybePush(event.details?.message);
  maybePush(event.payload?.message);
  maybePush(event.payload?.error);
  maybePush(event.payload?.error?.message);

  return candidates;
}

function classifyFailureCandidate(message) {
  if (/^warning:/i.test(message)) {
    return "warning";
  }

  if (/^(?:error:|fatal:)/i.test(message) || /usage limit|rate limit|try again at|request failed|permission denied|unauthorized/i.test(message)) {
    return "error";
  }

  return "info";
}

export function extractCodexFailureDetails({ stderr, stdoutLines, outputText = "" }) {
  const buckets = {
    error: [],
    info: [],
    warning: []
  };
  const seen = new Set();

  const addCandidate = (value) => {
    const message = String(value || "").trim();

    if (!message || seen.has(message) || isCodexCliNoise(message)) {
      return;
    }

    seen.add(message);
    buckets[classifyFailureCandidate(message)].push(message);
  };

  for (const line of stdoutLines) {
    const event = parseJsonLine(line);

    if (event) {
      for (const candidate of collectEventErrorCandidates(event)) {
        addCandidate(candidate);
      }

      continue;
    }

    addCandidate(line);
  }

  for (const line of String(stderr || "").split(/\r?\n/)) {
    addCandidate(line);
  }

  addCandidate(outputText);

  return buckets.error.at(-1) || buckets.info.at(-1) || buckets.warning.at(-1) || "Unknown Codex failure";
}

export function buildCodexCommandArgs({
  args,
  imagePaths = [],
  model = null,
  outputFile,
  prompt,
  threadId = null
}) {
  const commandArgs = [...args, "--skip-git-repo-check", "--json", "-o", outputFile];

  if (model) {
    commandArgs.push("-m", model);
  }

  for (const imagePath of imagePaths) {
    commandArgs.push("-i", imagePath);
  }

  const positionalArgs = [];

  if (threadId) {
    positionalArgs.push(threadId);
  }

  positionalArgs.push(prompt);

  return [...commandArgs, "--", ...positionalArgs];
}

export class CodexClient {
  constructor({ codexBin, codexCwd }) {
    this.codexBin = codexBin;
    this.codexCwd = codexCwd;
  }

  async createTurn({ prompt, model = null, imagePaths = [] }) {
    return this.#run({
      args: ["exec"],
      imagePaths,
      model,
      prompt
    });
  }

  async resumeTurn({ threadId, prompt, model = null, imagePaths = [] }) {
    return this.#run({
      args: ["exec", "resume"],
      imagePaths,
      model,
      prompt,
      threadId
    });
  }

  async #run({ args, prompt, model = null, imagePaths = [], threadId = null }) {
    const outputFile = path.join(os.tmpdir(), `discord-codex-${randomUUID()}.txt`);
    const commandArgs = buildCodexCommandArgs({
      args,
      imagePaths,
      model,
      outputFile,
      prompt,
      threadId
    });

    const stdoutLines = [];
    const stderrChunks = [];
    let stdoutBuffer = "";

    const result = await new Promise((resolve, reject) => {
      const child = spawn(this.codexBin, commandArgs, {
        cwd: this.codexCwd,
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

    let outputText = "";

    try {
      outputText = (await fs.readFile(outputFile, "utf8")).trim();
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw error;
      }
    } finally {
      await fs.rm(outputFile, { force: true });
    }

    if (result.code !== 0) {
      const details = extractCodexFailureDetails({
        stderr: result.stderr,
        stdoutLines: result.stdoutLines,
        outputText
      });
      throw new Error(`Codex exited with code ${result.code}: ${details}`);
    }

    let discoveredThreadId = threadId;
    let lastMessage = outputText;
    let usage = null;

    for (const line of result.stdoutLines) {
      try {
        const event = JSON.parse(line);

        if (event.type === "thread.started" && event.thread_id) {
          discoveredThreadId = event.thread_id;
        }

        if (event.type === "item.completed" && event.item?.type === "agent_message" && event.item.text) {
          lastMessage = event.item.text;
        }

        if (event.type === "turn.completed" && event.usage) {
          usage = event.usage;
        }
      } catch {
        continue;
      }
    }

    if (!discoveredThreadId) {
      throw new Error("Codex did not return a thread id.");
    }

    if (!lastMessage) {
      throw new Error("Codex did not return a final message.");
    }

    return {
      threadId: discoveredThreadId,
      responseText: lastMessage,
      usage
    };
  }
}
