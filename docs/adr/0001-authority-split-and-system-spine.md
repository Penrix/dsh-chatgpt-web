# ADR-0001 — Authority split and system spine

Status: Accepted  
Date: 2026-09-22

## Context

The original problem looked like "how do we continue after a ChatGPT Web window fills?" That framing proved too narrow.

A transient Web conversation, a Codex thread, a DSH turn and a local execution process can all disappear independently. If any one of them is treated as the whole task, continuity becomes fragile.

## Decision

Use this authority split:

```text
Conversation DVR / raw DSH session logs
= original historical evidence

dsh-meow-memory
= structured cross-session memory and recall

DSH Session / Agent Loop
= canonical live reasoning workflow

ChatGPT Web
= high-quality reasoning/inference surface

WebCodex
= durable local execution/effect authority

Codex / ACP
= optional coding worker
```

The normal reasoning path is:

```text
DSH active session + memory + tools
        ↓
ChatGPT Web inference
        ↓
final answer OR structured action proposal
        ↓
DSH validates / executes
        ↓
memory_* or WebCodex-backed tool
        ↓
authoritative result returns to DSH
        ↓
next inference
```

A ChatGPT Web conversation is replaceable provider state. It is never the canonical task identity.

## Consequences

Positive:

- a Web window may die without deleting the task;
- long-term memory can evolve independently of provider transport;
- local effects have a durable authority that is not guessed from model text;
- raw historical evidence remains recoverable even if structured memory is wrong;
- provider/browser implementations can be replaced without changing task identity.

Costs:

- state is deliberately split across multiple systems;
- integration boundaries must preserve provenance;
- debugging requires knowing which authority owns which fact.

## Rejected alternatives

### ChatGPT Web as the long-lived source of truth

Rejected because Web conversation state is transient, can compact or degrade, and couples cognition to a UI/provider surface we do not control.

### WebCodex Goal/Session as the complete cognitive memory

Rejected because durable execution state and high-semantic cognition are different domains.

### One merged repository/store for everything

Rejected because reducing component count would blur authority and make failure/recovery semantics harder to reason about.