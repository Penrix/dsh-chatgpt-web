# Reference survey — what to borrow, what not to inherit

> Status: implementation research
>
> Date: 2026-09-22
>
> Goal: identify concrete source projects and exact code/design seams worth borrowing for `Penrix/dsh-chatgpt-web`. This is not a popularity list. A project is valuable here only when it helps our target:
>
> **DSH owns the long-lived session/context; ChatGPT Web supplies high-quality reasoning; DVR keeps original cognition evidence; WebCodex owns durable local effects.**

---

## 1. Current first-choice synthesis

The best first implementation is **not** to fork one project wholesale.

Use:

1. **DeepSeek Harness upstream** for the canonical LLM adapter, Session, persistence and compaction contracts.
2. **twilightt1/dsh-llm-chatgpt-web** for the direct DSH `LlmAdapter` + owned Chromium + fresh Temporary Chat transport.
3. **2025ashore/DSH-Brain-Bridge** for the strict reasoning contract: one immutable DSH snapshot → one model result → DSH decides/executes.
4. **NishiMihaeru/dsh-chatgpt-web** for canonical-history digests, managed-conversation cache semantics and the Send uncertainty boundary.
5. **xicv/ego-chat** and **miuuyy/codex-chatgpt-web** for browser transaction durability and ambiguous post-dispatch recovery.
6. **DSH upstream recallable-compaction proposal** for the future “replay original history after compaction” seam that aligns with DVR.

The first experiment should deliberately avoid depending on a long-lived ChatGPT Web conversation.

```text
DSH active history
      ↓
fresh Temporary Chat
      ↓
one model inference
      ↓
result returned to DSH
      ↓
DSH records state / runs tool if needed
      ↓
next inference gets a new fresh Temporary Chat
```

This is an experiment default, not a permanent conclusion about the best conversation lifetime.

---

# 2. Tier A — strongest direct references

## 2.0 Phant0Meow/dsh-meow-memory — adopted dependency

**License:** MIT  
**Role:** structured cross-session memory layer for the DSH side of this system.

This is no longer merely a reference project. The architecture adopts it directly rather than rebuilding generic memory in this repository.

Borrow/use as-is:

- seven memory layers: soul/user/project/fact/lesson/topic/rules;
- first-turn stable memory snapshot;
- later small keyword-hit injection;
- explicit memory_search / memory_project / memory_read deep recall;
- memory_remember / memory_update write-back;
- reflection after substantial tool work;
- idle dream consolidation;
- post-compaction reinjection;
- SQLite provenance including source_session and timestamps;
- deterministic BM25/recency/importance retrieval before adding vectors.

Important integration rule:

```text
role=user + source.kind=user
= human request

role=user + source.kind=plugin + plugin=meow-memory
= memory context, not a new human request
```

Current v0.27.0 fixes several real 0.26.0 blockers (XML/string parameter coercion, duplicate reflection queueing, settings-layer application). Current main also correctly unwraps `agents.resume()` handles for post-restart auto-dream.

Known non-blocking open edge to test: a user message intentionally sent with DSH steering while an automatic dream turn is running can be spliced into that dream turn (#20). This is a DSH busy-turn/steer interaction; do not treat it as a reason to fork the whole memory subsystem unless it materially harms our workflow.

See `docs/meow-memory-integration.md`.


## 2.1 deepseek-ai/deepseek-harness

**License:** MIT  
**Role:** canonical host, not a source to replace.

### Borrow directly

- `LlmAdapter` contract.
- `ctx.llm.registerAdapter([...], adapter)`.
- `GenerateOptions` as the model request authority:
  - messages;
  - system;
  - tool schemas;
  - model;
  - reasoning effort;
  - abort signal;
  - session id / purpose.
- `StreamChunk` as the response contract.
- Session append-only event log.
- Session persistence seam and single-writer ownership.
- Existing compaction interface rather than inventing our own model-context store.
- DSH retry/cancel semantics rather than provider-local autonomous retry.

### Especially relevant future work: recallable compaction

Upstream currently has a **proposed**, not yet canonical, `recallable-compaction` design.

Its important idea is:

```text
append-only original history
        ↓
compaction hides it from active surface
        ↓
frozen index checkpoint + mutable state checkpoint
        ↓
history_read / history_search
        ↓
original transcript can be recalled into context again
```

This is highly aligned with our DVR principle:

> checkpoint is a description; original transcript is the performance.

Useful details:

- checkpoint pointers are deterministic, not model-authored;
- old bytes stay in the event log;
- `history_read(checkpoint, offset?)` returns rendered User/Assistant/Tool-result transcript;
- `history_search(...)` starts with literal deterministic search;
- semantic/vector fallback is deferred until evidence proves it is needed;
- recalled content enters context as normal logged tool results.

### Do not inherit blindly

- Do not assume the current basic compaction summary preserves artistic cognition.
- Do not equate DSH Session log with the broader DVR archive. The stores may converge later, but their provenance roles remain distinct.

---

## 2.2 twilightt1/dsh-llm-chatgpt-web

**License:** MIT (confirmed from repository LICENSE; GitHub metadata did not detect it).  
**Role:** best first code base for the direct DSH → ChatGPT Web provider.

### Why it is unusually close to our need

Its normal text path already does:

```text
DSH GenerateOptions
↓
compile full current DSH-visible history
↓
fresh ChatGPT Temporary Chat page
↓
one Web inference
↓
extract authoritative final answer
↓
emit DSH StreamChunks
```

That means the logical conversation already lives in DSH, not in the Web chat.

### Files worth borrowing

#### `src/adapter.ts`

Useful for:

- `ChatGptWebAdapter extends LlmAdapter`;
- provider/model metadata;
- serializing browser turns;
- DSH error classification;
- request snapshotting;
- cancellation plumbing;
- converting provider output into normal DSH `StreamChunk` values.

We should remove/avoid most of the optional native-MCP complexity for our first slice.

#### `src/chatgpt/prompt.ts`

Useful for:

- converting DSH messages into an explicit JSON envelope;
- preserving role semantics instead of flattening history to prose;
- transporting system + messages as data;
- refusing unsupported content explicitly;
- enforcing a hard composer-character budget.

Important lesson: do not paste a loose “transcript” and hope the Web model infers roles correctly.

#### `src/chatgpt/turn.ts`

Useful for:

- fresh Temporary Chat navigation each turn;
- positive completion evidence rather than “Stop button disappeared” alone;
- binding extraction to the newly created assistant turn;
- distinguishing answer roots from commentary/reasoning DOM;
- stable completion signatures;
- Markdown reconstruction.

#### `src/chatgpt/browser.ts`

Useful for:

- one shared browser daemon but one fresh page per inference;
- manual first login;
- persisting `storageState` after successful turns because ChatGPT rotates session state;
- reconnecting when the browser daemon dies;
- separating login/profile lifetime from Web-conversation lifetime.

### What not to inherit first

- native ChatGPT MCP connector mode;
- managed tunnel runtime;
- large native continuation/checkpoint subsystem;
- tool execution inside ChatGPT;
- provider-side long-lived tool rounds.

Those are valuable later, but they add complexity before we have tested the actual high-semantic cognition hypothesis.

---

## 2.3 2025ashore/DSH-Brain-Bridge

**License:** MIT  
**Role:** strongest architecture reference for “ChatGPT is reasoning, DSH is agent”.

Its core sentence should survive almost verbatim as an invariant:

```text
LLM proposes.
DSH decides.
DSH authorizes.
DSH executes.
DSH owns state.
```

### Borrow directly

#### Immutable reasoning snapshot

Each provider request is a complete snapshot:

- system;
- messages;
- action catalog;
- generation;
- DSH session correlation;
- purpose.

Then:

- `snapshotId = SHA-256(snapshot)`;
- one-time response nonce;
- one assigned worker;
- response accepted only if snapshot/nonce/worker match.

This prevents a stale Web worker from answering a newer DSH state.

#### One-result-per-inference rule

A Web inference should produce exactly one semantic result:

- final answer; or
- one action proposal; or
- a small independent read-only batch.

It should **not** become a second autonomous agent loop.

DSH executes the tool and decides whether another model inference is needed.

This is extremely important for us because it allows every model call to use a fresh Temporary Chat while the multi-step task still continues normally in DSH.

#### Tool schemas as data

The model does not need ChatGPT-native MCP tools.

DSH tool schemas can be serialized into the reasoning request as an action catalog. The model proposes:

```json
{
  "type": "action_proposal",
  "action": "read",
  "arguments": {"file_path": "..."}
}
```

The adapter validates against the exact DSH schema and converts the proposal into a DSH tool-call block.

Only DSH executes it.

This removes a large dependency on ChatGPT connector discovery/state.

#### Request durability ideas

Worth borrowing later:

- journal in-flight reasoning requests;
- idempotent replay of settled result;
- nonce rotation on worker takeover;
- no model request hidden inside a database transaction;
- bounded snapshot size;
- explicit context-overflow error so DSH compaction owns recovery.

### What not to inherit as a default

Brain-Bridge uses dedicated long-lived Web Brain conversations/workers and soft transcript budgets.

Our observed cognition decay means we should borrow its request contract but **not** assume a long-lived Brain transcript is beneficial.

---

## 2.4 NishiMihaeru/dsh-chatgpt-web

**License:** MIT  
**Role:** best reference for provider-side conversation cache and exact Send uncertainty.

### Borrow directly

Persistent mapping shape:

```text
conversationUrl
syncedMessageCount
syncedPrefixDigest
systemDigest
status = ready | uncertain
```

Core rule:

> DSH is source of truth. Managed ChatGPT conversation is provider-side cache only.

If prefix/system digests disagree, rebuild from DSH.

### Exact Send boundary

Before Send:
- proven failure can be retried.

After Send may have happened:
- never blindly resend;
- mark provider state uncertain;
- reconcile or rebuild on later turn.

This is one of the most important reliability rules in the project.

### DOM isolation

All ChatGPT-specific selectors/DOM logic are concentrated in one browser adapter layer.

We should preserve that separation.

### What not to inherit first

Its normal design binds one DSH Session to one long-lived managed ChatGPT conversation.

That is a useful comparison arm, not our Phase-1 default.

---

# 3. Tier B — important component references

## 3.1 miuuyy/codex-chatgpt-web / Penrix/codex-chatgpt-web

**License:** MIT  
**Role:** mature ChatGPT Web automation laboratory.

Borrow:

- model/effort selection;
- response DOM extraction;
- diagnostic checkpoints;
- browser lifecycle;
- structured transport;
- post-dispatch ambiguity handling;
- compaction/provenance lessons;
- real failures across Windows/Linux/macOS.

Do not make Codex thread/context the canonical cognitive host for this project.

---

## 3.2 xicv/ego-chat

**License:** MIT  
**Role:** browser transaction durability reference.

Most valuable rule:

```text
Send confirmed
→ broker/process/browser capture later fails
→ reconcile/read existing result
→ never perform another Send just because the caller lost the answer
```

Also useful:

- durable workflow IDs;
- operation IDs;
- exact browser-head correlation;
- digest-verified draft cleanup;
- provider-model policy checks.

Do not inherit its product framing where Codex is side A and ChatGPT is reviewer side B.

---

## 3.3 jackwener/opencli

**License:** Apache-2.0  
**Role:** generic logged-in-browser substrate.

Useful ChatGPT capabilities already implemented:

- `chatgpt ask`;
- new conversation;
- continue by conversation ID;
- read/detail existing conversations;
- model selection;
- persistent or ephemeral browser site sessions;
- multi-language composer/picker detection;
- backend-read + DOM fallback patterns.

Potential use:

- fallback browser driver;
- diagnostic CLI;
- DVR import/read helper;
- reference for selectors and login detection.

Why not make it the main correctness layer:

- it is intentionally generic;
- our provider needs stricter post-Send ambiguity and exact response identity than a general website CLI normally requires.

---

## 3.4 tzachbon/pi-chatgpt-web

**License:** Apache-2.0  
**Role:** small example of “existing agent loop + ChatGPT Web provider”.

Useful:

- simple provider boundary;
- external session gateway;
- process registry;
- turn lease so two agent sessions cannot fight over one browser tab;
- dead-process reaping;
- simple text tool-call protocol.

Do not copy its “tool calls execute without confirmation” policy.

---

## 3.5 WLV-ZEDD/dsh-chatgpt-web

**License:** MIT  
**Role:** broader DSH ChatGPT provider implementation and operational packaging.

Useful:

- login/setup/doctor UX;
- sidecar lifecycle;
- model catalog;
- DSH plugin packaging;
- Windows diagnostics.

Its current public README emphasizes pure-chat usage. Treat it as an operational reference, not the authority for our high-semantic context design.

---

# 4. Tier C — local body / control-plane references

## 4.1 jiezeng2004-design/dsh-chatgpt-bridge

**License:** MIT

Direction is opposite:

```text
ChatGPT Web
→ MCP
→ DSH Session / Goal / tools
```

Useful later for:

- exposing DSH session and Goal lifecycle;
- follow-up/control APIs;
- approval lifecycle;
- exact workspace/session binding;
- idempotent execution control.

Not needed for the first model-provider experiment.

---

## 4.2 wudegit/ChatGPT-DSH

**License:** MIT

Important observed fact from real ChatGPT MCP traffic:

- successive ChatGPT tool calls do not necessarily reuse one MCP Session;
- `x-openai-session` behaved like conversation-scoped identity in its test;
- `x-openai-subject` behaved like subject-scoped identity.

Useful later for bridging ChatGPT Apps/MCP into a stable DSH Session.

Also reinforces:

> workspace belongs to DSH Session, not the ChatGPT transport.

---

## 4.3 Penrix/webcodex / upstream WebCodex

Use for:

- durable local effect truth;
- Files/Git/Shell/Job;
- Computer Use;
- Workflow Session / Goal / Durable Agent;
- ACP coding-worker execution;
- outcome-unknown reconciliation.

Do not rebuild these capabilities inside the ChatGPT Web provider.

---

## 4.4 sleda/codex-gateway

**License:** MIT

Useful:

- stable tiny public ABI;
- discovery-first tool surface;
- durable Run;
- revision fencing;
- idempotency receipts;
- bounded resume context;
- append-only event history.

Good architecture reference, especially for future WebCodex/DSH integration.

---

## 4.5 Mieruko/MCP_Plugins_With_ChatGPTWeb

**License:** MIT

Useful mostly for UX:

- task/session binding;
- checkpoints;
- Workbench UI;
- review/diff;
- multi-workspace;
- operation history.

Not a replacement for DSH session authority.

---

# 5. Subscription/OAuth providers: useful comparison, not the same product

Several DSH projects use ChatGPT/Codex subscription authentication without browser UI automation:

- `V1ki/dsh-plugin-subscriptions` — MIT;
- `Hu9956/dsh-codex-provider` — MIT;
- `zsspub/dsh-openai-codex` — MIT;
- `Q-xuan/dsh-authmux` — MIT;
- `tatechen88/dsh-provider-openai-subscription` — license not clearly identified in GitHub metadata at research time.

These may be much more transport-stable than driving ChatGPT Web DOM.

However they use subscription/OAuth/backend routes, not necessarily the same Web product surface or exact model behavior the user values.

Therefore they are a **comparison provider**, not an assumed replacement.

A future experiment should compare:

```text
same DSH canonical context
        ├─ ChatGPT Web browser provider
        └─ ChatGPT/Codex subscription backend provider
```

If quality is equivalent for the target cognition, the backend route may be operationally preferable.

Do not assume equivalence without testing the actual male-channel task.

---

# 6. Local Coding Agent

**License:** AGPL-3.0

Useful concepts:

- explicit compact/resume UX;
- local checkpoints;
- fresh-chat continuation workflow.

Because our repository is not currently defined as an AGPL derivative, treat this project as **design reference only** unless we deliberately choose AGPL-compatible reuse.

Also, checkpoint-only recovery is not sufficient for our high-semantic problem.

---

# 7. What we should actually copy into Phase 1

## Code-level base

From MIT sources, start with the smallest subset analogous to Twilight:

```text
src/
  index.ts
  adapter.ts
  chatgpt/
    browser.ts
    daemon.ts
    daemon-startup.ts
    daemon-main.ts
    launch.ts
    session.ts
    guards.ts
    model.ts
    effort.ts
    prompt.ts
    turn.ts
    markdown.ts
    progress.ts
    usage.ts
```

But strip Phase-1 scope down to:

- text only;
- fresh Temporary Chat per inference;
- DSH canonical messages every call;
- no ChatGPT-native MCP;
- no long-lived managed conversation;
- no WebCodex integration yet.

Keep third-party notices for any copied/derived files.

## Architecture-level additions

From Brain-Bridge add our own small types:

```text
ReasoningSnapshot
ReasoningResult =
    final
  | action_proposal
  | readonly_batch
```

For the first high-semantic experiment, tools can stay disabled and only `final` is needed.

Do not block the text-provider milestone on the action protocol.

---

# 8. Why Phase 1 should be simpler than all the reference projects

The first hypothesis we need to test is not:

> Can ChatGPT Web autonomously code through DSH?

It is:

> **Does putting canonical conversation state in DSH and using a fresh ChatGPT Web inference surface produce more stable high-semantic cognition than one long ChatGPT Web conversation?**

So Phase 1 needs only:

```text
DSH session
→ full current active history
→ fresh Temporary Chat
→ answer
→ DSH session
```

No tools.

No WebCodex.

No DVR search.

No native ChatGPT connector.

No autonomous subagent.

Once that works, we can run the experiment that justifies every later layer.

---

# 9. License rule for this repository

Before copying code:

- MIT / Apache-2.0: reuse is allowed with required copyright/license notices.
- AGPL-3.0: do not copy implementation code unless we intentionally accept the license obligations.
- unclear/no license: ideas may be studied, but do not copy implementation text until the license is confirmed.

Create/update `THIRD_PARTY_NOTICES.md` when the first external implementation code is imported.

---

# 10. Current decision

The current implementation base is:

> **DSH-native LLM adapter + fresh Temporary Chat per inference, derived primarily from Twilight's MIT implementation, with Brain-Bridge's one-step/DSH-owned reasoning contract and Nishi/Ego fail-closed delivery rules.**

Long-lived Web-conversation reuse remains an experiment arm, not the default architecture.
