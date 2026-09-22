# AGENTS.md — dsh-chatgpt-web Repository Guide

This repository is primarily a **cognition-preservation and architecture experiment** before it is an implementation project.

The purpose is not merely to connect DeepSeek Harness (DSH) to ChatGPT Web. The hard problem is to move long-lived session/context ownership outside ChatGPT Web while preserving access to the raw conversation evidence needed to recover high-semantic cognition.

Read this file and `docs/cognition.md` before making architectural changes.

## 1. Preserve the problem definition

Do not silently collapse the problem back into “new window recovery”.

Current evidence says:

- high-semantic cognition can decay while staying in the same ChatGPT Web conversation;
- branching from a previously correct point can still produce a visibly weaker cognitive state even though the branch shares earlier conversation history;
- therefore window identity is not the root problem;
- code continuity and artistic/high-semantic cognitive continuity behave differently.

Treat this as the current working model until new experiments disprove it.

## 2. Keep the four authorities separate

Do not merge these concepts just because all of them participate in continuity:

- **DSH canonical session** — long-lived live session/history and agent-loop authority.
- **dsh-meow-memory** — structured cross-session memory, recall, reflection/dream, and post-compaction reinjection. Do not rebuild a competing generic memory engine here.
- **ChatGPT Web** — high-quality reasoning provider; its managed conversation is disposable/cache-like, not canonical history.
- **WebCodex** — durable local execution truth: files, Git, shell/processes, Jobs, Computer Use, Agent/ACP and effect reconciliation.
- **Conversation DVR / raw DSH logs** — append-only original conversation evidence and cognition-formation history.

A meow-memory entry, checkpoint, summary, Goal or Workflow Session is a derived/operational artifact and is not a substitute for raw DVR/session evidence.

## 3. DVR is first-class evidence

Do not reinterpret the project as “DVR was unnecessary because cognition still decays”.

The current decision is the opposite:

> DVR is useful precisely because a model can re-read/re-hear the original performance after implicit Web context has degraded.

Treat summaries/checkpoints as derived artifacts. Never let them overwrite or become more authoritative than the original evidence they summarize.

Important recovery material includes:

- exact user corrections;
- superseded interpretations and why they were superseded;
- successful outputs that acted as semantic anchors;
- failed outputs and why they were wrong;
- concept formation history;
- task-specific error formation history.

## 4. Do not claim DSH has solved cognitive decay

Moving canonical session ownership into DSH is a control-plane improvement, not proof that model cognition is now persistent.

DSH gives us control over:

- what history is durably stored;
- what context is projected into each inference;
- when a managed ChatGPT conversation is reused, rotated or discarded;
- how tool/effect results re-enter the canonical session.

It does not guarantee:

- that one inference can faithfully absorb arbitrarily large history;
- that a long prompt preserves all aesthetic weighting;
- that a generic summary recreates the prior cognition;
- that a fresh managed conversation will equal an old one.

These are experimental questions.

## 5. Context Projection is a research surface, not “summarization”

When building context for ChatGPT Web, keep at least these distinct:

1. current task/work state;
2. active cognitive anchors;
3. negative/error history;
4. relevant original DVR evidence.

Do not flatten all four into one prose summary by default.

The model may need exact examples or correction sequences more than abstract rules.

Do not introduce embeddings/vector search as an architectural requirement before real retrieval failures demonstrate the need.

## 6. Preserve uncertainty and provenance

Documentation and code should distinguish:

- user-observed behavior;
- reproduced implementation facts;
- source-based inference;
- design hypothesis;
- future experiment.

Examples:

- “same-window cognition often degrades after several rounds” is an observed behavior, not an OpenAI product guarantee about a fixed round count;
- “DSH canonical session may improve continuity” is a hypothesis to test;
- “DVR contains original evidence” is an architectural role, not a claim that replay always restores full cognition.

Do not turn working hypotheses into facts because they sound plausible.

## 7. Provider reliability must be fail-closed

A provider/web-automation layer must not blindly resend a prompt or repeat an external effect when delivery may already have occurred.

Preserve explicit states such as:

- not sent / safe to retry;
- sent/accepted;
- result captured;
- outcome unknown / reconcile first.

The ChatGPT Web conversation is disposable; duplicate side effects are not.

## 8. Keep repository boundaries clean

Current intended ownership:

- `Penrix/dsh-chatgpt-web`: DSH ↔ ChatGPT Web provider, context/session experiments, context projection.
- `Penrix/webcodex`: durable local body/execution substrate.
- `Penrix/chatgpt-continuity`: raw conversation DVR/evidence.
- `Penrix/codex-chatgpt-web`: provider/browser-automation experience and Codex-specific model bridge.

Do not merge repositories merely to reduce conceptual count. Extract interfaces first.

## 9. Implementation order

Prefer this order unless new evidence changes it:

1. prove a minimal DSH → ChatGPT Web → DSH turn;
2. implement DSH-Brain-Bridge-style final/action-proposal tool-loop semantics;
3. verify meow-memory snapshots and memory_* tools survive the provider bridge;
4. integrate WebCodex as the durable effect/body layer;
5. integrate DVR/raw-log replay for original evidence where structured memory is insufficient;
6. only then optimize retrieval/indexing, Web-conversation lifetime policy and UX.

Do not begin by rebuilding WebCodex or inventing a universal memory system.

## 10. Documentation is part of the implementation

This repository exists partly because important cognition is easy to lose.

When a discussion materially changes:

- the problem definition;
- an authority boundary;
- a rejected direction;
- an experiment result;
- a major architectural decision;

update the relevant cognition/design document in the same task.

Prefer recording **why the old view became wrong**, not only the new conclusion.

## 11. Validation standard

For implementation work, test the smallest real boundary that proves the intended behavior.

For cognition/architecture work, validate by replaying the decision chain:

- Does the document still distinguish same-window decay from cross-window recovery?
- Is DVR still first-class?
- Is DSH described as canonical live session/agent-loop host rather than a magic cognition store?
- Is meow-memory still the structured long-term memory layer rather than raw historical truth?
- Is ChatGPT Web still the reasoning brain rather than the history authority?
- Is WebCodex still the durable body/effect truth?
- Are observations separated from hypotheses?

If any of those become ambiguous, the documentation has regressed even if the code compiles.
