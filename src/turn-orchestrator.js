export class SessionNotFoundError extends Error {
  constructor(message) {
    super(message);
    this.name = "SessionNotFoundError";
  }
}

export class TurnBusyError extends Error {
  constructor(message) {
    super(message);
    this.name = "TurnBusyError";
  }
}

function getProviderSessionId(value) {
  return value?.sessionId ?? value?.threadId ?? value?.providerSessionId ?? value?.providerThreadId ?? value?.codexThreadId ?? null;
}

export class TurnOrchestrator {
  constructor({
    providerClient,
    providerId,
    sessionStore
  }) {
    this.providerClient = providerClient;
    this.providerId = providerId;
    this.sessionStore = sessionStore;
    this.activeSessions = new Set();
  }

  hasSession(sessionKey) {
    return Boolean(this.sessionStore.get(sessionKey));
  }

  isBusy(sessionKey) {
    return this.activeSessions.has(sessionKey);
  }

  async runTurn({
    imagePaths = [],
    mode,
    model = null,
    platformConversationId,
    platformId,
    platformMessageId = null,
    platformParentId = null,
    prompt,
    sessionKey,
    userId
  }) {
    if (this.activeSessions.has(sessionKey)) {
      throw new TurnBusyError("A request is already running for this conversation.");
    }

    this.activeSessions.add(sessionKey);

    try {
      const existingSession = this.sessionStore.get(sessionKey);
      const existingProviderSessionId = getProviderSessionId(existingSession);

      if (mode === "resume" && !existingProviderSessionId) {
        throw new SessionNotFoundError("This conversation is not connected to a provider session.");
      }

      const effectiveMode =
        mode === "auto"
          ? existingProviderSessionId
            ? "resume"
            : "new"
          : mode;

      const result =
        effectiveMode === "resume"
          ? await this.providerClient.resumeTurn({
              threadId: existingProviderSessionId,
              prompt,
              model,
              imagePaths
            })
          : await this.providerClient.createTurn({
              prompt,
              model,
              imagePaths
            });

      const providerSessionId = getProviderSessionId(result);

      if (!providerSessionId) {
        throw new Error(`Provider ${this.providerId} did not return a session id.`);
      }

      const now = new Date().toISOString();

      await this.sessionStore.upsert({
        ...(existingSession || {}),
        createdAt: existingSession?.createdAt ?? now,
        createdByUserId: existingSession?.createdByUserId ?? userId,
        lastActivityAt: now,
        lastRequestedModel: model,
        lastUsage: result.usage ?? null,
        platformConversationId,
        platformId,
        platformParentId,
        providerId: this.providerId,
        providerSessionId,
        sessionKey,
        starterMessageId: existingSession?.starterMessageId ?? platformMessageId
      });

      await this.sessionStore.recordTurn({
        imageCount: imagePaths.length,
        mode: effectiveMode,
        requestedModel: model,
        sessionKey,
        usage: result.usage ?? null,
        userId
      });

      return {
        mode: effectiveMode,
        responseText: result.responseText,
        sessionId: providerSessionId,
        usage: result.usage ?? null
      };
    } finally {
      this.activeSessions.delete(sessionKey);
    }
  }
}
