import fs from "node:fs/promises";
import path from "node:path";

export class SessionStore {
  constructor(filePath) {
    this.filePath = filePath;
    this.state = {
      threads: {}
    };
  }

  async load() {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });

    try {
      const raw = await fs.readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw);

      if (parsed && typeof parsed === "object" && parsed.threads && typeof parsed.threads === "object") {
        this.state = parsed;
      }
    } catch (error) {
      if (error.code === "ENOENT") {
        await this.#persist();
        return;
      }

      throw error;
    }
  }

  get(threadId) {
    return this.state.threads[threadId] ?? null;
  }

  async upsert(record) {
    this.state.threads[record.discordThreadId] = {
      ...this.state.threads[record.discordThreadId],
      ...record
    };

    await this.#persist();
  }

  async #persist() {
    const tempFile = `${this.filePath}.tmp`;
    const body = `${JSON.stringify(this.state, null, 2)}\n`;

    await fs.writeFile(tempFile, body, "utf8");
    await fs.rename(tempFile, this.filePath);
  }
}
