# meow-memory integration decision

> Date: 2026-09-22
>
> Status: accepted architecture dependency
>
> Upstream: `Phant0Meow/dsh-meow-memory` (MIT)

## Decision

`dsh-meow-memory` becomes the default **long-term memory layer** for the
DSH side of this project.

We will not build a competing generic long-term memory subsystem in
`Penrix/dsh-chatgpt-web` unless a concrete gap is demonstrated.

The resulting ownership model is:

```text
Conversation DVR
= raw original human/model evidence

dsh-meow-memory
= structured cross-session memory and recall

DSH Session
= canonical live reasoning/session history

ChatGPT Web
= high-quality inference provider

WebCodex
= durable local execution/body
```

These are complementary. None replaces all the others.

---

## Why this fits our problem unusually well

The user has already established that long-lived DSH memory itself is not the
unknown we need to prove again. The missing piece was a practical bridge that
lets ChatGPT Web remain the reasoning brain while DSH owns the session and
memory.

`dsh-meow-memory` already supplies the memory half.

### Seven memory layers

It stores distinct semantic roles rather than one blob:

- `soul` — AI identity / stable self-description.
- `user` — user facts and baseline preferences.
- `project` — project memory with subcategories such as overview, structure,
  decisions, quotes, ops and todo.
- `fact` — atomic facts.
- `lesson` — mistakes, corrections and learned boundaries.
- `topic` — ongoing discussion arcs with a goal.
- `rules` — design/behavior principles.

For the user's high-semantic creative work, especially important are:

```text
lesson
→ user corrections / "this was wrong"

rules
→ durable design principles

project.decisions
→ why the current architecture/cognition is this way

project.quotes
→ user wording that must not be paraphrased away

topic.goal
→ what the current discussion is actually trying to resolve
```

This is much closer to our real cognition needs than a flat vector-memory
store.

---

## Injection model

The plugin already implements a layered projection policy.

### First real user turn

Inject:

- all `soul`;
- all `user`;
- high-importance global `rules`;
- a memory guide and project list.

It intentionally does **not** do keyword hits on the first turn.

### Later user turns

From the second real user message onward, it injects a small top-k keyword
hit set (default top 2) across relevant memory layers.

The model can then explicitly deepen recall using:

- `memory_search`;
- `memory_project`;
- `memory_read`.

This means we do not need to invent a second automatic context projection
engine in the ChatGPT Web provider.

The provider should faithfully transport whatever active DSH context
meow-memory has already constructed.

---

## Compaction behavior

A particularly important feature for this project is post-compaction
re-injection.

When DSH compaction completes successfully, meow-memory:

1. releases per-session "already seen" injection/search state;
2. marks the session for re-injection;
3. on the next real user message, re-injects the long-term snapshot;
4. replays project overviews previously queried in that session;
5. replays active memories written/updated by that session;
6. rebuilds those blocks from the **current database state**, not cached old text.

This directly addresses a failure mode we were otherwise going to build
ourselves:

```text
DSH compacts
→ important memory disappears from active surface
→ next turn restores the durable memory layer
```

The ChatGPT Web provider should not duplicate this logic.

---

## Dream / reflection role

meow-memory has two write-back paths.

### Reflection

After a sufficiently tool-heavy turn, the main agent is prompted to record:

- new durable memory;
- user corrections/preferences;
- stale or wrong memory updates;
- keyword/importance corrections.

### Dream

After an idle window becomes eligible, the window's own main agent
consolidates memories that window created or actually saw.

Important properties we want to preserve:

- the window is consolidated by its own session/agent rather than an unrelated
  new context;
- the consolidation scope is bounded to memories the window created,
  received, searched or read;
- the dream timestamp is tied to the last real conversation state rather than
  plugin-generated activity;
- stable rules are protected against pointless repeated churn;
- failures release the lease and retry later instead of being falsely marked
  complete.

This is useful because it turns memory formation into part of the DSH
conversation lifecycle instead of an external batch summarizer.

---

## Raw evidence remains separate

meow-memory is still a **derived structured memory system**.

It does not replace the DVR.

The authority order is:

```text
raw conversation/session evidence
        ↓ may produce
structured meow-memory entry
        ↓ may be injected/searched
current model context
```

A memory entry can be excellent while still being a derived artifact.

For disputes, subtle artistic cognition, exact wording, or a suspected bad
memory abstraction, we must still be able to return to:

- DSH raw session logs for DSH-hosted conversations;
- `Penrix/chatgpt-continuity` DVR for historical/native ChatGPT Web
  conversations and branches.

meow-memory's own system guide already treats raw DSH session logs as the
fallback evidence source when structured memory is insufficient. That aligns
with our DVR principle rather than replacing it.

---

## Retrieval policy

meow-memory currently uses deterministic lexical retrieval:

- Unicode/CJK-aware tokenization;
- BM25;
- recency weighting;
- importance weighting;
- keyword-oriented per-turn hits;
- project-scoped full views.

This is acceptable as our first memory retrieval layer.

Do **not** add a vector database merely because BM25 is not semantic.

We should first observe concrete misses on the user's real workload.

When a memory search is insufficient, the escalation path is:

```text
automatic top-k hit
↓
memory_search
↓
memory_project / memory_read
↓
raw DSH session / DVR replay
↓
only then consider another retrieval index
```

---

## Required provider compatibility

The ChatGPT Web provider must preserve DSH message provenance.

In particular:

```text
role=user + source.kind=user
= real human request

role=user + source.kind=plugin
= context/snapshot/notice, NOT a human request
```

This matters because meow-memory injects memory as plugin snapshot messages
immediately before a real user message.

The provider must:

- include plugin snapshot content in the reasoning context;
- keep its source marker;
- target the newest genuine human-authored user message;
- never answer a memory snapshot as if the user had just said it.

Our Phase-1 prompt transport already carries `source.kind`; its outer
contract must explicitly explain this rule.

---

## Required tool-loop compatibility

meow-memory's long-term behavior depends on DSH tools:

- `memory_remember`
- `memory_search`
- `memory_project`
- `memory_find_similar`
- `memory_read`
- `memory_update`
- `memory_dream`

Therefore the project can no longer stop at a pure-chat provider.

The next major implementation slice is:

```text
DSH GenerateOptions
  + tool schemas
        ↓
fresh ChatGPT Web inference
        ↓
final
OR
one structured action proposal
        ↓
adapter validates against exact DSH tool schema
        ↓
emit normal DSH tool-call StreamChunk
        ↓
DSH executes tool
        ↓
tool result enters canonical Session
        ↓
next fresh ChatGPT Web inference
```

This is the DSH-Brain-Bridge pattern.

ChatGPT-native MCP is not required for ordinary meow-memory tools.

---

## WebCodex relationship

Once the DSH tool loop works, WebCodex can be exposed as another durable tool
backend.

Conceptually:

```text
                    dsh-meow-memory
                    structured memory
                          │
                          ▼
DVR / raw logs --->     DSH
                   session + agent loop
                          │
                  fresh model request
                          ▼
                    ChatGPT Web
                          │
                   final / proposal
                          ▼
                         DSH
                    /             \
          memory_* tools       WebCodex tools
                                  │
                                  ▼
                                Windows
```

The model sees one DSH tool universe.

It does not need to know which tool is backed by SQLite memory and which tool
is backed by WebCodex durable execution.

---

## What this supersedes

The earlier plan treated "prove external long-term memory/context improves
high-semantic continuity" as a Phase-1 research gate.

The user has clarified that this direction has already been validated in
prior DSH memory work.

Therefore we no longer block implementation on that experiment.

The immediate engineering objective is now:

> **make ChatGPT Web a reliable DSH reasoning provider that can participate in
> the ordinary DSH tool loop, while meow-memory owns long-term memory and
> WebCodex owns durable local execution.**

We can still run quality comparisons later, but they are validation and
tuning work, not the architectural gate.
