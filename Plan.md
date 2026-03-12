# Plan

## Current Phase

- Expand `no-claw` from a Discord-only bot bridge into a multi-platform bot bridge.
- First strategic goal: support Feishu.

## Goal 1: Support Feishu

### Desired Outcome

- Feishu users can trigger local Codex and Claude CLI sessions from Feishu messages.
- Follow-up messages continue the correct backend session instead of starting over every turn.
- Feishu support is additive: Discord keeps working, and each platform can be enabled independently.

### Scope Decisions

- Reuse the existing provider clients (`CodexClient`, `ClaudeClient`) and local session-store model.
- Extract platform-agnostic turn orchestration from the current Discord flow instead of duplicating business logic.
- Start with one Feishu bot integration path first, then widen scope only after that path is stable.
- Defer advanced Feishu UI work such as rich cards, custom interactive flows, and admin tooling.

### Assumptions

- Initial Feishu support should focus on the same core workflow the project already has on Discord:
  - receive a user prompt
  - pass it to the selected local CLI
  - return the result to the same conversation context
- Initial parity target is text-first; image support should follow if Feishu attachment flow is straightforward.

### Milestones

1. Split the current Discord-specific runtime into platform adapters and shared turn orchestration.
2. Add Feishu config, startup wiring, and secrets/env handling.
3. Implement Feishu inbound event handling and message verification.
4. Implement Feishu reply flow for new conversations.
5. Implement session resume mapping for follow-up Feishu messages.
6. Add tests for the shared orchestration path and the Feishu adapter.
7. Update README and runbook docs after Feishu support is usable.

### Non-Goals For This Phase

- Rebuilding the provider layer.
- Supporting every Feishu interaction surface on day one.
- Over-abstracting for platforms that do not exist yet.
