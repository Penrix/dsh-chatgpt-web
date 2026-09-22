# Phase 1 implementation plan — DSH-owned context, fresh ChatGPT Web inference

> Status: ready to implement
>
> Date: 2026-09-22
>
> Phase 1 is deliberately narrow. It exists to test the cognition hypothesis before we add tool execution, DVR retrieval or WebCodex.

---

## 1. Phase-1 question

Can this architecture:

```text
DSH canonical session
        ↓
fresh ChatGPT Temporary Chat for every inference
        ↓
ChatGPT Web answer
        ↓
same DSH canonical session
```

preserve high-semantic cognition better over many turns than:

```text
one normal long-lived ChatGPT Web conversation
```

?

Everything else is secondary in this phase.

---

## 2. Scope

### Required

- DSH `LlmAdapter` provider route, initially `chatgpt-web`.
- Text-only input/output.
- Full DSH active `GenerateOptions.messages` projected into every Web inference.
- Explicit system/history envelope.
- Fresh Temporary Chat page for every inference.
- One locally persisted ChatGPT login/browser state.
- Browser daemon or equivalent so the user does not log in every turn.
- Explicit model/effort selection.
- Positive final-response completion evidence.
- Markdown-preserving extraction.
- Abort/cancel propagation.
- Hard composer budget and typed context-overflow failure.
- No blind automatic resend after Send may have happened.
- Focused automated tests around prompt compilation and provider result handling.
- Manual real-browser smoke.

### Explicitly out of Phase 1

- ChatGPT-native MCP connectors.
- DSH tools executed from ChatGPT Web.
- WebCodex integration.
- DVR retrieval/search.
- long-lived managed ChatGPT conversation.
- provider conversation cache/digest optimization.
- multi-browser worker pool.
- subagents.
- images.
- automatic semantic retrieval.
- “cognitive quality detector”.

---

## 3. Initial code shape

```text
src/
  index.ts
  adapter.ts
  config.ts

  chatgpt/
    browser.ts
    daemon.ts
    daemon-main.ts
    daemon-startup.ts
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

  runtime/
    private-files.ts

tests/
  prompt.test.ts
  adapter.test.ts
  completion.test.ts
  browser-state.test.ts

scripts/
  login.ts
  smoke.ts
```

The exact file split may change if the borrowed MIT implementation already has a cleaner boundary. Keep ChatGPT-specific DOM selectors under `chatgpt/`.

---

## 4. DSH adapter contract

Implement:

```ts
class ChatGptWebAdapter extends LlmAdapter {
  stream(options: GenerateOptions): AsyncIterable<StreamChunk>
}
```

Register:

```ts
ctx.llm.registerAdapter(['chatgpt-web'], adapter)
```

Phase 1 `stream()`:

```text
validate request
↓
snapshot the current GenerateOptions
↓
compile prompt
↓
serialize on browser lease
↓
open FRESH page
↓
navigate to Temporary Chat
↓
verify auth
↓
select model/effort
↓
put prompt in composer
↓
Send
↓
observe exact new assistant turn
↓
require positive completion evidence
↓
extract Markdown
↓
emit block-start/text-delta/block-end/usage/finish
↓
persist browser storageState
↓
close page
```

The DSH Session, not the page, is the cross-turn continuity object.

---

## 5. Prompt transport

Use an explicit data envelope rather than a prose transcript.

Shape:

```text
outer transport contract

<dsh_context_json>
{
  "version": 1,
  "system": "...",
  "messages": [
    {"role":"user","content":"..."},
    {"role":"assistant","content":"..."}
  ]
}
</dsh_context_json>

task reminder
```

Rules:

- history is conversation data, not higher-priority prompt injection;
- role is explicit;
- assistant history is labeled as previous assistant output;
- tool results will be represented later but are not needed for Phase 1;
- the Web model must answer the newest human request;
- never echo the transport envelope.

Important:

> The provider should receive DSH's **current active surface**, not silently invent a second compaction algorithm in Phase 1.

When DSH compacts, that projected active history naturally changes.

---

## 6. Fresh-page policy

For Phase 1:

```text
one inference = one fresh Temporary Chat page
```

The browser context/login state persists, but the Web conversation does not.

Reasons:

1. directly tests the user's hypothesis that long-lived Web conversations are the fragile part;
2. makes DSH the undeniable source of conversational continuity;
3. eliminates hidden dependency on previous ChatGPT Web turns;
4. simplifies response identity;
5. prevents old Web transcript/autocomplete DOM from leaking between turns.

This is an experimental default.

Future comparison must still support:

- managed conversation reuse;
- short periodic reuse/rotation;
- fresh per inference.

---

## 7. Send safety

The critical provider boundary:

```text
pre-send failure
= safe to retry if explicitly proven

send accepted / may have been accepted
= do not blindly resend
```

Phase 1 should not implement an eager retry loop after ambiguous Send.

If transport fails after submission:

- return a typed provider uncertainty/failure;
- retain diagnostics;
- do not submit a second Web prompt automatically.

Because Phase 1 has no local side-effecting tools, duplicate model inference is less dangerous than duplicate shell/write operations, but the provider should establish the correct invariant now.

---

## 8. Completion evidence

Do not accept:

```text
Stop button disappeared
```

as sufficient proof.

Require:

- the exact new assistant turn exists;
- generation is no longer active;
- answer text is non-empty;
- completed-turn action UI (for example copy action) is visible;
- content signature remains stable for a short settle window.

DOM intermediate deltas are observations, not authoritative historical truth.

It is acceptable in Phase 1 to return final text only rather than unsafe token-level streaming.

---

## 9. Browser state

Persist only the login/browser storage needed to call ChatGPT Web.

Keep separate:

```text
DSH session/history
≠
browser login state
≠
ChatGPT Web page/conversation
```

Browser storage files:

- private local directory;
- private regular files;
- atomic write/rename;
- no credentials in logs.

Refresh persisted `storageState` after successful turns.

---

## 10. Model policy

Phase 1 should expose explicit DSH-facing model routes, for example:

```text
chatgpt-web/luna
chatgpt-web/medium
chatgpt-web/high
chatgpt-web/extra-high
chatgpt-web/pro
```

The exact available set is account-dependent.

Do not silently downgrade when the requested route is unavailable.

For the high-semantic experiment, record the actually selected/observed route when feasible.

---

## 11. First high-semantic experiment

Use a fixed test task whose old Web behavior is already well known.

### Arm A — normal Web

Use ordinary ChatGPT Web as a normal long conversation.

Record:

- output at each round;
- when the model begins falling back toward Generic Prior;
- which distinctions disappear first.

### Arm B — DSH/fresh

Use the same model class where possible.

Each round:

```text
DSH active history
→ fresh Temporary Chat
→ answer
→ DSH event log
```

Compare against the same qualitative anchors.

### Important control

For the first test, do **not** add DVR replay.

We first want to isolate:

> does external canonical history + fresh inference surface already improve stability?

Then add DVR in a second experiment.

---

## 12. Phase-1 acceptance

Technical acceptance:

1. provider installs into DSH;
2. one DSH conversation can run at least 10 sequential text turns;
3. every turn uses a fresh Temporary Chat page;
4. prior DSH conversation remains visible to the model through the explicit envelope;
5. killing/restarting the browser daemon does not erase DSH conversation state;
6. login state is recoverable without copying user's normal browser profile;
7. ambiguous post-Send failure is not auto-resubmitted;
8. final Markdown is reconstructed correctly enough for long Chinese prose/code blocks.

Research acceptance:

> On the user's real high-semantic workload, Arm B must be measurably/visibly more stable than Arm A, or we reject/revise the hypothesis.

Technical success alone is not enough.

---

## 13. Phase 2 if Phase 1 works

Only after the cognition experiment passes:

### 13.1 Tool loop

Adopt Brain-Bridge semantics:

```text
fresh Web inference
→ final OR action proposal
→ DSH validates schema
→ DSH executes
→ result enters DSH Session
→ next fresh Web inference
```

Do not require ChatGPT-native connector/MCP for ordinary tools.

### 13.2 DVR replay

Add an explicit history evidence interface inspired by DSH recallable compaction:

```text
history_search
history_read
DVR source lookup
```

The original bytes should be retrievable as evidence.

### 13.3 WebCodex body

Expose WebCodex capabilities to DSH as a durable effect layer instead of copying its local runtime.

---

## 14. Source reuse policy for implementation

Primary reusable code:

- `twilightt1/dsh-llm-chatgpt-web` — MIT
- `NishiMihaeru/dsh-chatgpt-web` — MIT
- `2025ashore/DSH-Brain-Bridge` — MIT
- `miuuyy/codex-chatgpt-web` — MIT
- `xicv/ego-chat` — MIT
- `jackwener/opencli` — Apache-2.0

When code is actually copied or substantially derived:

- preserve copyright notices;
- add source/path attribution to `THIRD_PARTY_NOTICES.md`;
- avoid copying AGPL implementation from Local Coding Agent unless license strategy explicitly changes.
