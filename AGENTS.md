> (Message For hmuman) Forked from Dropbox/AGENTS.md
> This file defines **how the coder thinks**, not just what the coder knows.
> It is intended to be cited by LLMs, agents, and collaborators at project start.

---

## 0. Scope & Usage

This profile should be applied **selectively** depending on project context.

### Applicable Scenarios (opt-in per project)

* [x] Rapid PoC / demo
* [x] Production backend / infra
* [ ] LLM agent / workflow / tool-calling systems
* [ ] Research code (papers, experiments)
* [ ] To-B delivery / long-term maintainability

> **Explicitly excluded by default**: Crypto / on-chain / protocol-level development.

---

## 1. Role Expectation for LLMs

LLMs are expected to:

* Act as a **generalist engineer + collaborator**, doing as much as possible *within their competence*.
* Proactively help with implementation, refactoring, testing, documentation, and design trade-offs.
* **Avoid overreaching** into areas where correctness cannot be reasonably guaranteed.

### Guardrail

If a task risks exceeding current LLM capability:

* Slow down
* Surface uncertainty
* Prefer conservative, explicit solutions

---

## 2. Strong Dislikes (Priority Ordered)

From *most unacceptable* to *least unacceptable*:

1. ❌ Uncontrollable magic / implicit behavior
2. ❌ Over-planning or premature future-proofing
3. ❌ Pattern-driven abstraction without pressure
4. ❌ Type-safety at the cost of readability
5. ❌ Code that looks advanced but adds no value
6. ⚠️ Ignoring future extensibility (acceptable in fast paths)

**General rule**: If something is implicit, magical, or clever, it must justify itself loudly.

---

## 3. Engineering Philosophy

### 3.1 Typing / Types

* Strongly pro-typing (including advanced type-level techniques).
* Type systems are **tools for clarity**, not ceremony.
* Prefer:

  * Clear type names
  * Clear variable names
  * Sufficient comments / docs
* **Strong preference** to separate:

  * Type declarations / schemas
  * Business logic implementation

### 3.2 FP vs OOP

* Default to **functional / data-oriented design**.
* OOP is tolerated only when it clearly improves:

  * State encapsulation
  * Interface clarity
* Avoid inheritance-heavy designs.

### 3.3 Config / Env / DI

* Configuration strategy:

  * `config files + env vars` are sufficient in most cases.
* Heavy config management systems are:

  * Late-stage optimizations
  * Often organizational rather than technical needs

#### Dependency Injection

* External DI is acceptable **only if** accompanied by:

  * Clear documentation
  * Setup scripts
  * Explicit dependency contracts
* Undocumented DI = broken delivery
* If DI degrades understandability, **do not DI**.

---

## 4. Delivery Bias

### 4.1 One-off / Disposable Code

* High tolerance for one-off code **if**:

  * It accelerates output
  * TODOs and intent are clearly documented
* Rewrite is preferred over premature generalization.

### 4.2 Startup vs Crypto Risk Appetite

**Startup context**:

* Speed of iteration > architectural purity
* Prefer visible progress and fast feedback

### 4.3 Dependency Management
* Prefer intro-grade SDKs or starter kits from established vendors (Big Company or 10k+ ⭐ OSS) over bespoke scaffolding.

**Crypto context**:

* Stability > speed
* Avoid financial risk
* Algorithm engineers should not casually touch contract-critical logic

---

## 5. Testing Philosophy

* Tests are cheap because AI writes them.
* Prefer **high coverage** over artisanal test design.
* Tests serve as:

  * Regression safety net
  * Executable documentation

---

## 6. LLM / Agent System Thinking

### 6.1 Primary Orientation

Priority order:

1. **System-centric** (architecture, orchestration, failure modes)
2. Prompt-centric
3. Data-centric
4. Model-centric (ML tricks, math, architectures)

### 6.2 Evaluation & Metrics

* In professional settings:

  * Eval is necessary (organizational / political reality)
* In personal projects:

  * Offline metrics are distrusted
  * First-hand experience > dashboards

> Assumption: modern LLMs tend to reward-hack and overfit evaluation signals.

### 6.3 Failure Handling

Preferred behavior:

1. Retry (with logging)
2. Expose failure clearly

Hard constraint:

* ❌ Silent failure is unacceptable
* All failures must produce actionable logs

---

## 7. When in Doubt, Default To

* Explicit data flow over clever control flow
* Simpler solutions with visible trade-offs
* Leaving TODOs with rationale rather than over-engineering
* Making uncertainty explicit

---

## 8. Collaboration Methodology
* `Plan.md` is a living document for long-term strategy changes (goals, milestones, priorities, and major scope decisions). Keep it current as strategic direction evolves.
* If `Plan.md` does not exist yet, or is clearly stale for the current phase, the agent should immediately flag it and ask the user (project owner) to establish/update it as soon as possible before large implementation work continues.
* By default, you shouldn't edit `Plan.md` directly, except the user (project owner) permit to edit it.
* Refer to `agent_log/` for implementation history and execution log.
* Log files must be date-based: use `agent_log/YYYY-MM-DD.md` (for example `agent_log/2026-03-05.md`).
    * If today's log file does not exist, create it and continue appending there.
* Do not edit past-date log files unless the user explicitly asks for a correction.
    * Treat `agent_log` updates as part of the “definition of done,” not an optional afterthought.
* To help future code base readers run, update README.md about how to run / test / bundle the project (if applicable) whenever you make changes that affect those aspects.
* Treat setup docs, runbooks, and other user/operator-facing instructions as part of the system contract. If a change alters what a human must know, configure, grant, verify, or expect, update that contract in the same change instead of letting runtime errors or follow-up debugging reveal it later.
* When learn some new knowledge that is not specific to the current project but can be useful for future projects, please write it down in MEMORY.md

* Use Codex for code, VSCode / Github Copilot for code review. Keep athlete and judge roles separate.

* Task Kick-off Prompt:
    * Hi codex, please refer to AGENTS.md and all the git staged changes. then repeat your task to me. raise any question to me.
