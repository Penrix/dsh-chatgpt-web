# Roadmap

This file describes sequencing. GitHub Issues are the execution queue.

## Milestone 0 — architecture locked

Status: complete

Established:

- ChatGPT Web is the reasoning provider, not canonical history.
- DSH owns the live session and agent/tool loop.
- dsh-meow-memory owns structured long-term memory.
- WebCodex owns durable local execution/effect truth.
- DVR/raw logs own original historical evidence.
- provider retries fail closed after an ambiguous Send.
- no vector/semantic memory layer is added without a demonstrated retrieval gap.

Relevant ADRs: ADR-0001, ADR-0002, ADR-0004.

## Milestone 1 — DSH ↔ ChatGPT Web provider + tool loop

Execution issue: [#1](../../issues/1)

ADR-0004 corrects the implementation route without changing the product goal.

### M1A — prove the transport seam

Preferred primary path:

```text
DSH messages
→ dsh-chatgpt-web semantic/Responses mapping
→ codex-chatgpt-web local /v1/responses
→ ChatGPT Web
→ Responses result
→ DSH
```

First acceptance is deliberately small:

```text
DSH sends a trivial request such as "reply exactly OK"
→ ChatGPT Web visibly answers
→ DSH receives the answer as the same inference result
```

Required:

- preserve message provenance;
- preserve model/effort intent needed by the chosen Web route;
- return positive completion evidence;
- keep post-Send ambiguity fail-closed inside the specialized transport;
- do not make DSH reconstruct reply completion from a competing primary DOM loop;
- do not give canonical Session authority to Codex merely because its transport is reused;
- prove the browser-only relay first; Full Harness / official Tunnel / ChatGPT connector is not an M1 prerequisite.

The existing direct-browser implementation is retained as fallback/control and safety evidence, but is frozen as the default investment path until this relay experiment is resolved.

### M1B — prove the DSH tool loop over that transport

Goal:

```text
DSH messages + exact tool schemas
→ ChatGPT Web
→ final OR structured action proposal
→ DSH validation
→ normal DSH tool call/result
→ next ChatGPT Web inference
```

Required:

- transport exact tool names/descriptions/schemas;
- parse one unambiguous final/action result;
- reject malformed or unknown tool proposals;
- emit normal DSH tool-call chunks;
- DSH executes tools; the transport never fabricates local effects;
- preserve the existing DSH action-proposal/tool-call contract instead of depending on ChatGPT-native MCP for M1;
- tool results return to the same canonical DSH Session before the next inference.

Exit condition: a real DSH session can call a harmless test tool through the relay-backed ChatGPT Web provider and continue after the result.

This milestone does **not** require WebCodex yet. WebCodex remains Milestone 3.

## Milestone 2 — meow-memory end-to-end

Execution issue: [#2](../../issues/2)

Required:

- first-turn snapshot is treated as context, not user intent;
- later memory hit injection survives transport;
- memory_search / memory_project / memory_read work;
- memory_remember / memory_update work;
- successful DSH compaction triggers meow-memory reinjection visible to ChatGPT Web;
- reflection works;
- automatic dream busy-turn behavior is explicitly dogfooded.

Exit condition: a fresh DSH session can recall, write and update durable memory through ChatGPT Web without ChatGPT-native MCP.

## Milestone 3 — WebCodex body

Execution issue: [#3](../../issues/3)

Expose a minimal set of WebCodex capabilities through DSH without copying WebCodex's runtime.

First targets:

- project/file read;
- safe write;
- git status/diff;
- durable Job execution/observation;
- outcome reconciliation after ambiguous transport.

Exit condition: ChatGPT Web can complete a small real code change through DSH → WebCodex and the resulting file/Git truth survives provider/thread death.

## Milestone 4 — raw evidence replay

Execution issue: [#4](../../issues/4)

Connect DSH to raw DSH session evidence and historical `Penrix/chatgpt-continuity` DVR evidence.

Do not build a vector database by default.

Exit condition: when structured memory is insufficient, the model can retrieve an exact original correction/example and replay it into the current reasoning turn.

## Milestone 5 — product hardening

Only after the spine works:

- browser daemon hardening;
- conversation reuse/rotation policy;
- richer observability;
- Windows install/update flow;
- UX;
- retrieval optimizations;
- optional semantic index if real misses justify it.

## Rule for changing this roadmap

If a new finding changes component ownership or milestone order, create/update an ADR first. Do not silently edit the roadmap until the reason is durable.