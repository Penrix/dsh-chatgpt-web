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

Relevant ADRs: ADR-0001, ADR-0002.

## Milestone 1 — DSH ↔ ChatGPT Web tool loop

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

- preserve message provenance;
- transport exact tool names/descriptions/schemas;
- parse one unambiguous final/action envelope;
- reject malformed or unknown tool proposals;
- emit normal DSH tool-call chunks;
- never make ChatGPT Web execute local effects directly;
- keep post-Send ambiguity fail-closed.

Exit condition: a real DSH session can call a harmless test tool through ChatGPT Web and continue after the result.

## Milestone 2 — meow-memory end-to-end

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

Expose a minimal set of WebCodex capabilities through DSH without copying WebCodex's runtime.

First targets:

- project/file read;
- safe write;
- git status/diff;
- durable Job execution/observation;
- outcome reconciliation after ambiguous transport.

Exit condition: ChatGPT Web can complete a small real code change through DSH → WebCodex and the resulting file/Git truth survives provider/thread death.

## Milestone 4 — raw evidence replay

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