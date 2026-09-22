# Architecture direction

> Status: working architecture
>
> This document describes ownership and seams. It intentionally does not choose a final browser automation stack, retrieval database, or managed-conversation lifetime before experiments.

---

## 1. System principle

The central rule is:

> **No transient model window, browser conversation, provider transport or coding thread is the task itself.**

For this project, long-lived truth is split by domain instead of being forced into one “memory” object.

```text
                    +-------------------------+
                    |  Conversation DVR       |
                    |  raw original evidence  |
                    +------------+------------+
                                 |
                           retrieval/replay
                                 |
                                 v
+----------------+      +-------------------------+
| user intent /  | ---> |          DSH            |
| current input  |      | canonical session host  |
+----------------+      | event/history authority |
                        | context projection      |
                        +------------+------------+
                                     |
                                  LLM call
                                     |
                                     v
                        +-------------------------+
                        |      ChatGPT Web        |
                        | high-quality reasoning  |
                        | provider-side state     |
                        +------------+------------+
                                     |
                          intent / decision / tool
                                     |
                                     v
                        +-------------------------+
                        |        WebCodex         |
                        | durable local body      |
                        | effect authority        |
                        +------------+------------+
                                     |
                                     v
                                  Windows
```

Codex/ACP may appear inside or beside WebCodex as a coding worker.

---

## 2. Authority table

| Domain | Authority | Not authoritative for |
| --- | --- | --- |
| Long-lived reasoning session | DSH | local filesystem effect truth; original pre-DSH Web DVR |
| Raw conversation evidence | Conversation DVR | current task progress; filesystem state |
| Web-model inference | ChatGPT Web | canonical history; durable task identity |
| Local effects | WebCodex / Runner / underlying OS reality | artistic cognition |
| Coding implementation context | Codex / ACP when delegated | full high-semantic artistic state |
| Derived summaries/checkpoints | their parent system | original conversation evidence |

The system should be reconstructible because each fact has a named owner.

---

## 3. DSH session versus DVR

Both preserve history, but they solve different problems.

### DSH canonical session

For interactions that run through this architecture, DSH should durably retain the canonical sequence required to continue the workflow:

- user inputs;
- model outputs;
- selected context projections or references to them;
- tool intents;
- tool results;
- compaction events;
- task metadata;
- provider correlation.

Its purpose is to run the current reasoning workflow.

### DVR

DVR is provenance-first original evidence.

It may include:

- historical ChatGPT Web conversations created before DSH existed;
- branches;
- conversations not routed through this provider;
- exact user/model message history;
- chronology and branch relationships;
- original successful and failed “performances”.

The purpose is not merely to continue the current task, but to make the actual cognition-formation history replayable.

Therefore:

```text
DSH event log
≠ DVR

DSH may reference DVR evidence.
DSH may ingest selected DVR evidence.
DSH must not silently rewrite DVR as a summary.
```

If in the future one physical store implements both, the provenance/authority distinction still remains.

---

## 4. ChatGPT Web provider boundary

A provider should conceptually implement:

```text
Input:
  canonical DSH inference request
  + explicit projected context
  + provider policy

Output:
  assistant/model result
  + provider delivery evidence
  + optional browser/conversation correlation
```

It should not define:

- what the task ultimately is;
- which old evidence is authoritative;
- whether a local effect actually occurred;
- long-lived memory policy.

### Provider-side conversation mapping

If a managed ChatGPT conversation is reused, keep only replaceable correlation such as:

```text
dsh_session_id
managed_conversation_id/url
synced canonical prefix/digest
provider policy observation
last confirmed send/result markers
```

If the mapping is stale, missing or inconsistent with DSH canonical state, discard/rebuild it.

Do not infer canonical DSH state from “the latest ChatGPT conversation”.

---

## 5. Conversation lifetime must stay configurable

The observed high-semantic decay means provider conversation lifetime is a first-class experiment.

The provider must be able to support at least:

```text
reuse:
  many DSH turns -> one Web conversation

rotate:
  N or policy-bounded turns -> rebuild Web conversation

fresh:
  every inference -> new Web conversation
```

Avoid architecture that makes only one of these possible.

A future adaptive policy may exist, but do not add one before experiments establish useful signals.

---

## 6. Context projection

DSH should not simply replay the entire lifetime blindly and should not reduce everything to one summary.

A projected inference context may be assembled from typed components:

```text
Current
  - current user input
  - current task / current Working
  - immediate recent turns

Durable work truth
  - relevant WebCodex/Project/Job facts

Cognitive anchors
  - successful reference outputs
  - active semantic-shape material
  - current high-weight distinctions

Negative history
  - rejected interpretations
  - supersession chain
  - representative failed outputs
  - why they failed

Raw replay
  - exact DVR excerpts where abstraction loses important information
```

The order and budget of these components are research questions.

### Important constraint

A projection is not automatically a “better summary”.

For high-semantic work, an exact short example may carry more useful cognition than a long abstract explanation.

---

## 7. WebCodex integration boundary

WebCodex should remain authoritative for effectful local work.

Preferred flow:

```text
ChatGPT Web proposes/requests an action
↓
DSH/provider resolves it to an allowed structured intent
↓
WebCodex canonical ToolRuntime
↓
authorization / project / session / effect checks
↓
Runner / Job / ACP / local OS
↓
authoritative structured result
↓
DSH records result
↓
next model inference
```

Do not rebuild:

- file authority;
- Git state;
- process lifecycle;
- durable Job observation;
- Computer Use;
- ACP execution;

inside this repository unless an actual integration gap requires an adapter.

### Uncertain effects

If transport dies after an effect might have been dispatched:

```text
do not infer "not executed"
do not blindly repeat
reconcile through the effect authority
```

Provider delivery and local execution are separate uncertainty domains.

---

## 8. Codex role

Codex remains useful in two ways:

1. coding worker through ACP or other controlled delegation;
2. a coding-oriented context holder whose state can often be reconstructed from repository reality.

Do not assume:

```text
Codex read full transcript
=> Codex now has the same artistic cognition
```

It can be an excellent archivist/implementer without reproducing the weighting and semantic coordinates formed in another model conversation.

---

## 9. Existing projects to inspect, not blindly merge

The following projects are relevant references:

- `deepseek-ai/deepseek-harness`
  - canonical Session / agent-loop / provider-adapter substrate to study.
- `NishiMihaeru/dsh-chatgpt-web`
  - important reference for treating DSH as source of truth and ChatGPT managed conversation as provider-side cache.
- `WLV-ZEDD/dsh-chatgpt-web`
  - another direct DSH ↔ ChatGPT Web implementation path to compare.
- `Penrix/codex-chatgpt-web`
  - hard-won browser automation, compaction and Web-provider experience.
- `Penrix/webcodex`
  - local body / durable execution substrate.
- `Penrix/chatgpt-continuity`
  - DVR / original conversation evidence.

This repository should extract the smallest valuable seams from them.

Do not merge source trees until ownership and interface boundaries are proven.

---

## 10. First implementation slices

### Slice 1 — provider skeleton

Prove:

```text
one DSH session
→ one ChatGPT Web inference
→ one response committed back to DSH
```

No WebCodex required yet.

### Slice 2 — canonical-session recovery

Kill/rebuild the managed Web conversation and prove the same DSH session remains authoritative.

### Slice 3 — conversation lifetime experiment

Run the same high-semantic workload under:

- reuse;
- periodic rotation;
- fresh.

Do not optimize before observing quality differences.

### Slice 4 — DVR replay

Retrieve exact old evidence and include it as an explicit projection component.

Compare with summary/checkpoint-only recovery.

### Slice 5 — WebCodex body

Connect structured tool/effect intent to WebCodex and return authoritative results into DSH.

---

## 11. Failure modes to watch

### False success: technical continuity only

The DSH session survives, but high-semantic choices drift back to Generic Prior.

This is not success.

### False success: huge prompt replay

The system dumps the entire DVR every turn and appears accurate only because it is brute-forcing context.

This may be useful as a control experiment, but not necessarily a sustainable design.

### False success: checkpoint substitution

A compact summary works for coding and is assumed to solve artistic cognition.

Do not generalize across domains without evidence.

### False success: Web conversation becomes source of truth again

If provider code begins reconstructing the DSH task from “whatever is currently in the browser conversation”, the architecture has regressed.

### False success: duplicated effect after transport loss

If a send/tool call might have been accepted, retry only after reconciliation proves it safe.

---

## 12. Current architectural hypothesis

The architecture is useful if it can make this statement true in practice:

> **The reasoning brain may still be ChatGPT Web, but the long-lived cognitive workflow is no longer trapped inside one ChatGPT Web conversation.**

That is the hypothesis to test.
