import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

function createCodexSessionsRoot() {
  return path.join(os.homedir(), ".codex", "sessions");
}

async function collectJsonlFiles(rootDir) {
  const entries = await fs.readdir(rootDir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(rootDir, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await collectJsonlFiles(entryPath)));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".jsonl")) {
      const stat = await fs.stat(entryPath);

      files.push({
        mtimeMs: stat.mtimeMs,
        path: entryPath
      });
    }
  }

  return files;
}

function toTimestampMs(value) {
  const ms = Date.parse(value ?? "");

  return Number.isNaN(ms) ? -Infinity : ms;
}

async function readTokenCountsFromFile(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  const lines = raw.split("\n");
  const tokenCounts = [];

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index].trim();

    if (!line) {
      continue;
    }

    let parsed;

    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }

    if (parsed?.type === "event_msg" && parsed?.payload?.type === "token_count") {
      tokenCounts.push({
        filePath,
        timestamp: parsed.timestamp ?? null,
        ...parsed.payload
      });
    }
  }

  return tokenCounts;
}

export async function getLatestCodexStatus(sessionsRoot = createCodexSessionsRoot()) {
  let candidateFiles;

  try {
    candidateFiles = await collectJsonlFiles(sessionsRoot);
  } catch (error) {
    if (error.code === "ENOENT") {
      return null;
    }

    throw error;
  }

  const recentFiles = candidateFiles
    .sort((left, right) => right.mtimeMs - left.mtimeMs)
    .slice(0, 24);

  let latestInfo = null;
  let latestRateLimits = null;

  for (const file of recentFiles) {
    const tokenCounts = await readTokenCountsFromFile(file.path);

    for (const tokenCount of tokenCounts) {
      if (
        tokenCount.info &&
        (!latestInfo || toTimestampMs(tokenCount.timestamp) > toTimestampMs(latestInfo.timestamp))
      ) {
        latestInfo = tokenCount;
      }

      if (
        tokenCount.rate_limits &&
        (!latestRateLimits ||
          toTimestampMs(tokenCount.timestamp) > toTimestampMs(latestRateLimits.timestamp))
      ) {
        latestRateLimits = tokenCount;
      }
    }
  }

  if (!latestInfo && !latestRateLimits) {
    return null;
  }

  return {
    filePath: latestInfo?.filePath ?? latestRateLimits?.filePath ?? null,
    timestamp:
      toTimestampMs(latestInfo?.timestamp) >= toTimestampMs(latestRateLimits?.timestamp)
        ? latestInfo?.timestamp ?? latestRateLimits?.timestamp ?? null
        : latestRateLimits?.timestamp ?? latestInfo?.timestamp ?? null,
    usageTimestamp: latestInfo?.timestamp ?? null,
    rateLimitTimestamp: latestRateLimits?.timestamp ?? null,
    info: latestInfo?.info ?? null,
    rate_limits: latestRateLimits?.rate_limits ?? null
  };
}
