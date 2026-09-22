# ADR-0002 — Adopt dsh-meow-memory instead of building a second memory engine

Status: Accepted  
Date: 2026-09-22

## Context

The project originally treated long-term memory/context projection as a major research area to implement after the ChatGPT Web provider.

Further review found that `Phant0Meow/dsh-meow-memory` already implements the DSH-native memory lifecycle we need: seven semantic layers, stable first-turn memory injection, targeted recall, explicit memory tools, reflection/write-back, idle dream consolidation, post-compaction re-injection, and provenance.

The missing system piece is not "invent memory again". It is the bridge that lets ChatGPT Web participate in the ordinary DSH agent/tool loop.

## Decision

Adopt upstream `dsh-meow-memory` as the default structured long-term memory layer.

Do not build a competing generic memory subsystem in this repository unless a concrete, reproduced gap requires an adapter or extension.

The provider must preserve DSH message provenance:

```text
role=user + source.kind=user
= genuine human request

role=user + source.kind=plugin + plugin=meow-memory
= contextual memory snapshot/notice
```

meow-memory remains derived memory. Raw DSH session logs and Conversation DVR remain the authority for original historical evidence.

Prefer upstream releases/current main instead of a Penrix fork unless:

1. an upstream bug blocks our workflow;
2. a fix cannot reasonably be contributed upstream;
3. we need deliberately different product behavior.

## Consequences

Positive:

- avoids duplicating a mature DSH memory engine;
- reduces this project's core scope to provider/tool bridge + WebCodex + DVR integration;
- compaction re-injection and memory lifecycle come from one owner;
- upstream fixes remain available.

Costs:

- compatibility with meow-memory becomes an integration requirement;
- upstream/DSH version changes must be tracked;
- the known busy-turn/dream steering edge must be dogfooded.

## Rejected alternatives

### Build our own memory engine first

Rejected because it duplicates solved infrastructure before a real unmet need is demonstrated.

### Replace DVR with meow-memory

Rejected because structured memories are abstractions; DVR/raw logs preserve original formation evidence.

### Fork meow-memory immediately

Rejected because current upstream already contains the fixes we need and a fork would create unnecessary maintenance divergence.