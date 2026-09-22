# Current cognition — context ownership, cognitive decay, DVR and DSH

> Status: current working cognition
>
> Date: 2026-09-22
>
> Purpose: preserve what was actually learned in the discussion that led to this repository. This is not a product README and not a generic memory-system essay. Future work should update this document when experiments materially change the model.

---

## 1. The original framing was too shallow

The first framing was:

```text
old ChatGPT Web window fills up
→ open a new window
→ recover the old window's context/cognition
```

That framing led naturally to checkpoints, recovery packages, summaries, GitHub formation-history documents and other handoff mechanisms.

Those mechanisms are useful, but they do not describe the real failure.

The decisive observation is:

> **The cognitive degradation also happens without changing windows.**

Even more strongly:

> **A branch created from a previously correct node can have the same shared historical text yet still feel cognitively weaker than the original branch.**

So “new window versus old window” is not the root variable.

The real target is the effective lifetime of high-semantic cognition inside ChatGPT Web.

---

## 2. The failure is domain-sensitive

For ordinary coding work, losing the exact internal cognitive state is often cheap.

The durable reality is external:

```text
files
Git
tests
compiler output
process state
issues
logs
```

A fresh model can inspect the reality again and continue.

For high-semantic artistic work, especially the user's male-webnovel cognition, the decisive state is not fully externalized.

The model must preserve distinctions such as:

- which semantic dimension currently has priority;
- where the first search should begin;
- which apparently reasonable direction is actually generic/cheap;
- why a specific relationship carries reader value;
- which successful examples currently anchor the coordinate system;
- which failed examples define the negative boundary;
- which user correction superseded an earlier interpretation;
- which words are technically correct but currently functioning as placeholders.

A model can still remember the vocabulary while losing this weighting.

That produces the characteristic failure:

```text
the model still "knows" the theory
but its actual choices drift back toward Generic Prior
```

---

## 3. Current empirical recovery process

A serious attempt to restore the cognition has already required approximately four separate rounds:

```text
Round 1
read the male-channel semantic cognition documents
→ establish the base coordinate system

Round 2
read the current recovery package
→ restore current FCC / Working

Round 3
read the full formation history in GitHub
→ understand why the current ideas formed

Round 4
read the relevant task's error-formation history
→ restore rejected paths, negative boundaries and prior failures
```

Even after this, the restored state is only barely sufficient compared with the original fluent state.

Then continued conversation causes noticeable degradation again.

Therefore:

> **The problem is not merely that a recovery package omitted facts.**

A recovery sequence can be expensive enough that by the time the cognition has been rebuilt, the Web conversation is already consuming the same scarce context mechanism that caused the degradation.

The exact number of rounds is an empirical observation in this workload, not an OpenAI-specified invariant.

---

## 4. Why a checkpoint is weaker than DVR

A checkpoint is valuable for explicit work state:

- objective;
- current Working;
- decisions;
- completed work;
- remaining work;
- next action.

But an old ChatGPT Web conversation cannot be assumed to have perfect access to its entire historical dialogue when asked to produce that checkpoint.

Therefore the final checkpoint may faithfully describe what the model currently remembers while already omitting or distorting older formation history.

The user identified a better analogy:

> **DVR is like listening to the reference music again.**

This leads to a critical distinction:

```text
checkpoint / summary
= description of the performance

raw DVR
= the original performance
```

The DVR does not guarantee permanent cognition.

Its value is that the model can return to the actual evidence rather than a later compressed retelling.

This is especially important for:

- exact user corrections;
- wording that caused a conceptual pivot;
- successful outputs that established taste;
- failed outputs whose defects are hard to reconstruct abstractly;
- the order in which distinctions were formed.

DVR therefore remains a first-class requirement.

---

## 5. What changed after this realization

The previous continuity problem had two mixed goals:

```text
A. make the work survive window/thread death
B. make the cognition survive window/thread death
```

The branch and same-window evidence shows that B is not fundamentally about window death.

So the new direction is:

> **Stop trying to make the ChatGPT Web conversation itself be the long-lived context host.**

We cannot change OpenAI's internal Web conversation compression or hidden context policy from this project.

We can change who owns the canonical history.

---

## 6. New authority model

### 6.1 DSH: canonical cognitive/session host

DeepSeek Harness (DSH) is a promising host because the session can exist independently of any one model/provider conversation.

Desired responsibility:

- durable session identity;
- event/history persistence;
- active context construction;
- compaction under our control;
- tool-result reintegration;
- model-provider independence.

DSH does **not** become the artistic brain.

It becomes the long-lived container that decides what evidence and active context the brain sees.

### 6.2 ChatGPT Web: reasoning brain, not historical authority

ChatGPT Web remains valuable because the desired model quality lives there.

But its conversation should be treated as:

- a provider-side cache;
- a transport surface;
- an inference container;
- disposable state.

It must not be the only place where the task's history exists.

If the Web conversation disappears, DSH history should remain.

If DSH and Web conversation history disagree, the intended source of truth is DSH.

### 6.3 WebCodex: durable body

WebCodex is more useful after this reframing, not less.

It does not need to solve artistic cognition.

Its responsibility is concrete reality:

- local files;
- Git;
- shell/processes;
- validation;
- Jobs;
- Computer Use;
- durable Agent/Task mechanisms;
- ACP/coding-agent delegation;
- effect reconciliation.

This is the “body”.

### 6.4 Conversation DVR: original cognitive evidence

The DVR belongs beside DSH, not inside a summary.

It supplies the original formation history that DSH can retrieve and project into a model turn when needed.

### 6.5 Codex: coding worker / optional context holder

Codex can hold coding context and can inspect conversation material mechanically.

That is useful for code.

But simply giving Codex the transcript does not give it the cognitive state that formed in the Web conversation. It may understand the archive mechanically without inheriting the same artistic weighting.

Therefore Codex is not assumed to be the primary long-lived host for high-semantic cognition, though it remains an important worker.

---

## 7. Target shape

```text
                 raw Conversation DVR
                  /      |       \
          corrections  anchors  error history
                  \      |       /
                   context retrieval
                         |
                         v
                +----------------+
                |      DSH       |
                | canonical      |
                | session/history|
                | context build  |
                +-------+--------+
                        |
                 LLM provider call
                        |
                        v
                +----------------+
                |  ChatGPT Web   |
                | reasoning      |
                | only           |
                +-------+--------+
                        |
                 assistant intent
                        |
                        v
                +----------------+
                |   WebCodex     |
                | local body /   |
                | durable effects|
                +----------------+
```

The important inversion is:

```text
before:
ChatGPT conversation contains the task

target:
the task/session contains a replaceable ChatGPT conversation
```

---

## 8. Managed Web conversation policy is an experiment

A provider can use several strategies:

### Strategy A — reuse

Keep one managed ChatGPT conversation for many DSH turns.

Advantage:
- less repeated context transfer;
- natural local conversational continuity.

Risk:
- exactly the observed high-semantic cognitive decay.

### Strategy B — periodic rotation

Reuse the conversation briefly, then rebuild a new managed conversation from DSH canonical state.

Possible benefit:
- preserve short-range flow without letting one Web conversation accumulate indefinitely.

Unknown:
- how often to rotate;
- whether rehydration cost itself destroys quality.

### Strategy C — decay-triggered rotation

Detect qualitative/structural signs of drift and rebuild.

Unknown:
- drift detection may itself be unreliable.

### Strategy D — fresh per inference

Each DSH inference uses a fresh Web conversation and sends the intended active context explicitly.

Advantage:
- zero dependence on implicit long-lived Web conversation memory.

Risk:
- rebuilding the subtle artistic state in one turn may be harder than maintaining it over a few turns;
- input size/quality becomes critical.

No strategy is currently declared the winner.

---

## 9. Context Projection is the real hard problem

Externalizing history solves control, not cognition.

Even with a perfect append-only DSH event log, the model cannot necessarily consume the whole lifetime of the session every turn.

Therefore each inference needs an explicit projection.

At minimum, do not flatten these categories:

### A. Work state

What is being done now?

- current task;
- current position;
- verified facts;
- next action.

### B. Active cognitive anchors

What must the model *feel/weight correctly* right now?

- current successful examples;
- semantic shapes;
- highest-priority distinctions;
- live Reader/market coordinates.

### C. Negative/error formation history

What must the model not fall back into?

- rejected interpretations;
- generic priors;
- failed outputs;
- why those outputs were wrong;
- supersession relations.

### D. Raw DVR excerpts

What original performance should be replayed because abstraction is insufficient?

These categories may require different retrieval and ordering.

A generic “summarize the old conversation” step is not enough.

---

## 10. Important negative conclusions

These were genuine corrections in the discussion and must not be lost.

### 10.1 “The problem is new-window recovery” — rejected

Same-window and branch degradation contradict this as the root explanation.

### 10.2 “DVR is unnecessary because cognition still decays” — rejected

DVR remains the best available original evidence for re-entry/recalibration.

### 10.3 “Just make a more complete recovery package” — insufficient

The recovery package is derived from already-compressed cognition and can become very expensive to reload.

### 10.4 “WebCodex continuity alone solves the artistic problem” — rejected

WebCodex is excellent for work/effect continuity, not a replacement for artistic cognition.

### 10.5 “DSH solves cognitive persistence automatically” — not established

DSH changes authority and control. Quality must be demonstrated experimentally.

### 10.6 “Codex can read the transcript, so it can recreate the cognition” — insufficient

Archive access is not the same as inheriting the weighting/state produced by the original conversation.

---

## 11. What would count as real progress

The first useful proof is not:

> “DSH successfully called ChatGPT Web.”

It is an A/B experiment on a known high-semantic task.

### Baseline

Use a normal ChatGPT Web conversation for enough rounds that the known degradation becomes observable.

Record which distinctions fail first.

### DSH-hosted variant

Keep the canonical session outside Web Chat.

Try one or more Web-conversation policies:

- reuse;
- periodic rotation;
- fresh rehydrate.

Use the same task and the same evaluation anchors.

### DVR intervention

When quality degrades, replay actual raw evidence rather than only a checkpoint.

Measure whether this restores the correct distinctions better than summary-only recovery.

The experiment is successful only if output quality remains more stable on the actual high-semantic task, not merely because the session can technically be resumed.

---

## 12. Current one-line model

> **DSH owns the long-lived session/context; DVR keeps the original cognitive performance; ChatGPT Web remains the high-quality reasoning brain; WebCodex is the durable local body. The hard problem is no longer “how to keep a window alive”, but “how to project enough of the right original and active cognition into each model inference without trusting the Web conversation to remember it for us.”**
