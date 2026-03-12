import fs from "node:fs/promises";
import path from "node:path";

export class SessionStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.state = {
      stats: this.#createEmptyStats(),
      threads: {}
    };
  }

  async load() {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });

    try {
      const raw = await fs.readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw);

      if (parsed && typeof parsed === "object" && parsed.threads && typeof parsed.threads === "object") {
        this.state = {
          stats: {
            ...this.#createEmptyStats(),
            ...(parsed.stats && typeof parsed.stats === "object" ? parsed.stats : {})
          },
          threads: parsed.threads
        };

        if (!this.state.stats.lastTurnSessionKey && this.state.stats.lastTurnDiscordThreadId) {
          this.state.stats.lastTurnSessionKey = this.state.stats.lastTurnDiscordThreadId;
        }
      }
    } catch (error) {
      if (error.code === "ENOENT") {
        await this.#persist();
        return;
      }

      throw error;
    }
  }

  get(sessionKey) {
    return this.state.threads[sessionKey] ?? null;
  }

  getStats() {
    return {
      ...this.state.stats
    };
  }

  countThreads() {
    return Object.keys(this.state.threads).length;
  }

  async upsert(record) {
    const sessionKey = record.sessionKey ?? record.discordThreadId;

    this.state.threads[sessionKey] = {
      ...this.state.threads[sessionKey],
      ...record
    };

    await this.#persist();
  }

  async recordTurn({
    sessionKey,
    imageCount = 0,
    mode,
    requestedModel = null,
    usage = null,
    userId
  }) {
    const effectiveSessionKey = sessionKey ?? null;
    const nextStats = {
      ...this.state.stats,
      completedTurns: this.state.stats.completedTurns + 1,
      lastTurnAt: new Date().toISOString(),
      lastTurnDiscordThreadId: effectiveSessionKey,
      lastTurnSessionKey: effectiveSessionKey,
      lastTurnImageCount: imageCount,
      lastTurnMode: mode,
      lastTurnRequestedModel: requestedModel,
      lastTurnUsage: usage,
      lastTurnUserId: userId
    };

    if (usage) {
      nextStats.totalInputTokens += usage.input_tokens ?? 0;
      nextStats.totalCachedInputTokens += usage.cached_input_tokens ?? 0;
      nextStats.totalOutputTokens += usage.output_tokens ?? 0;
    }

    this.state.stats = nextStats;
    await this.#persist();
  }

  async #persist() {
    const tempFile = `${this.filePath}.tmp`;
    const body = `${JSON.stringify(this.state, null, 2)}\n`;

    await fs.writeFile(tempFile, body, "utf8");
    await fs.rename(tempFile, this.filePath);
  }

  #createEmptyStats() {
    return {
      completedTurns: 0,
      lastTurnAt: null,
      lastTurnDiscordThreadId: null,
      lastTurnSessionKey: null,
      lastTurnImageCount: 0,
      lastTurnMode: null,
      lastTurnRequestedModel: null,
      lastTurnUsage: null,
      lastTurnUserId: null,
      totalCachedInputTokens: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0
    };
  }
}
