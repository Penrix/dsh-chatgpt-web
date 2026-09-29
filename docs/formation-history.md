# Cognition formation history

> Status: chronological correction log
>
> Date: 2026-09-22
>
> This file preserves **how the current architecture was reached**, especially the wrong turns that were explicitly corrected. It exists because a clean final summary can accidentally erase the reasons that make the final conclusions meaningful.

---

## Stage 0 — the original pain looked like “new/old window continuity”

The initial long-running problem was described as:

```text
old ChatGPT/Codex thread becomes full
→ new thread/window
→ expensive re-alignment
```

This naturally pushed work toward checkpoints, recovery packages, project memory, durable Goal/Session state, and cross-thread handoff.

For coding work, this framing is largely useful.

For the user's male-webnovel cognition, it later proved incomplete.

---

## Stage 1 — WebCodex became important for durable work

Inspection of WebCodex, especially its Goal / Workflow Session / Durable Agent / Wake direction, clarified:

```text
model turn != Agent
browser window != task
request lifetime != Job lifetime
```

This was a real advance.

It showed that local work can survive model/window death through durable external state.

At this stage the working direction became:

```text
ChatGPT Web / model
→ WebCodex durable runtime
→ Windows
```

and `codex-chatgpt-web` was reinterpreted as a provider/adapter rather than the owner of durable work.

This remains correct for **work continuity**.

---

## Stage 2 — alternative projects were searched

Several related projects suggested useful ideas.

### Local Coding Agent

Its compact/resume flow is approximately:

```text
Chat A
→ model writes structured checkpoint
→ local store
→ Chat B reads checkpoint
→ verify workspace/Git
→ continue
```

This is useful for coding continuity.

But it is not a deeper answer to high-semantic cognition because the checkpoint is still a derived model summary.

### Codex Gateway / similar durable-run projects

These reinforced:

- task/thread separation;
- checkpoint/revision/idempotency;
- stable MCP/tool ABI;
- durable external coordination.

Useful for runtime design, but still primarily work-state continuity.

### Pure-MCP ChatGPT-Web bridges

These reinforced another good principle:

> Prefer normal ChatGPT Web as the user/model surface without browser UI automation when possible.

These projects informed the architecture, but none resolved the artistic cognition problem by themselves.

---

## Stage 3 — first major correction: the root problem is not window death

A crucial user observation changed the problem definition.

The user reported that even when:

- the original ChatGPT Web window has not reached its hard limit;
- a new branch is created at the **most correct previous node**;
- the branch shares the same earlier conversation history;

the new branch still has a noticeably weaker cognitive state than the original branch.

Also, simply continuing the same Web conversation for several more rounds can cause the high-semantic state to become vague.

This implies:

```text
shared historical text
!=
same effective cognition
```

and:

```text
new-window recovery failure
is only one symptom
```

The root problem is closer to:

> **high-semantic cognition has a short and fragile effective residency inside ChatGPT Web.**

The user empirically estimates that degradation often becomes obvious after only several rounds in this workload. This is an observation, not a fixed OpenAI product contract.

---

## Stage 4 — why coding does not expose the same failure

The user emphasized that coding does not suffer nearly as much.

Reason:

```text
code state exists outside the model
```

A new window can read code, Git, tests, errors and current files, then continue.

The artistic/male-channel work depends on much less externally forced state:

- taste;
- semantic weight;
- reader-position;
- what feels cheap;
- what has already been rejected;
- which examples currently anchor the space.

Therefore this project must not generalize from “coding resumes fine” to “cognition resumes fine”.

---

## Stage 5 — attempted direction: cognitive re-induction / boot sequence

A proposed explanation was:

> Maybe the state cannot be serialized directly, but a new model can be induced back into the same cognitive attractor through a carefully designed boot sequence.

That suggested:

```text
read semantic foundation
→ read current state
→ replay successful/failed examples
→ calibration probes
→ resume work
```

This sounded promising but the user explicitly rejected it as a root solution because it had already been tried in practice.

The actual recovery protocol already requires roughly:

```text
1. read male-channel semantic cognition documents
2. read the recovery package / restore FCC
3. read the complete GitHub formation history
4. read the relevant task's error-formation history
```

Even then, the recovered state is only barely usable compared with the fluent original state.

Worse:

> by the time this multi-round recovery completes, continued ChatGPT Web conversation quickly starts degrading again.

Therefore a better boot sequence may still be useful tactically, but it cannot be the architectural root answer.

The system cannot depend on “teach the Web conversation for four rounds, then enjoy a long stable state”.

---

## Stage 6 — second major correction: DVR was being undervalued

A mistaken turn in the discussion treated DVR as only a necessary historical archive and suggested that it still could not solve the real cognition problem.

The user corrected this more strongly:

> **DVR is useful because the window/model can actually go back and read the original conversation.**

The analogy is reference music:

```text
checkpoint
= someone explains how the reference performance sounded

DVR
= replay the reference performance itself
```

This matters because ChatGPT Web cannot be trusted to truly re-read its entire old conversation from its own implicit context.

By the time an old window writes a final checkpoint, its accessible history may already be compressed or vague.

So a checkpoint can accidentally encode:

```text
what the old window currently remembers
```

rather than:

```text
what actually happened across the full cognition formation
```

DVR is therefore not a secondary backup.

It is the original evidence source used to recover/refresh cognition better than a derived checkpoint can.

Important nuance:

> DVR does not stop future decay. It makes re-reading/recovery possible from the true performance.

---

## Stage 7 — the engineering question changed

Once same-window decay and DVR's role were both accepted, the question changed from:

```text
How do we make a new ChatGPT window continue the old window?
```

to:

```text
How do we stop the ChatGPT Web conversation from being the sole owner of long-lived context?
```

The user proposed:

- use Codex to hold context; or
- use DSH to hold context;
- keep ChatGPT Web as the brain.

This is the decisive architectural pivot.

---

## Stage 8 — why DSH is attractive

Codex is excellent at coding continuity because it can hold coding context and re-read project reality.

But it does not automatically inherit the subtle cognition formed in the Web conversation, even if it can mechanically read the transcript.

DSH is attractive because it can instead be the long-lived reasoning/session host while treating the model as a provider.

Desired inversion:

```text
before:
ChatGPT Web conversation owns the session
and the task lives inside it

target:
DSH owns the session
and a ChatGPT Web conversation is only a replaceable inference surface
```

This does not make DSH the “better brain”.

The desired brain remains ChatGPT Web.

DSH is the external session/context holder that lets us decide what the brain sees each time.

---

## Stage 9 — direct DSH → ChatGPT Web became the preferred shape

The user then stated the strongest version:

> If DSH can directly call ChatGPT Web, that would be better.

This avoids routing the long-lived cognitive session through a coding-oriented container merely because Codex already exists.

The intended layering becomes:

```text
DSH
= canonical long-lived reasoning session

ChatGPT Web
= high-quality reasoning provider

DVR
= original cognitive evidence / replay source

WebCodex
= durable local body and effect truth

Codex / ACP
= coding worker when useful
```

Existing public `dsh-chatgpt-web` implementations mean this direction should be studied as an integration/fork problem before assuming it must be built from zero.

---

## Stage 10 — important non-solution: “just send everything every turn”

Moving canonical history out of ChatGPT Web creates control, but does not magically eliminate model limits.

Possible naive solution:

```text
DSH stores everything
→ replay entire lifetime every inference
```

This may be useful as a control experiment, but it is not automatically a good final architecture.

Reasons:

- one inference still has finite usable context;
- exact artistic weighting may not survive giant undifferentiated input;
- the provider may still impose limits or internal processing we do not control;
- cost/latency and signal dilution may become severe.

Therefore the remaining research problem is **context projection**, informed by DVR rather than replacing it.

---

## Stage 11 — current settled structure

As of this discussion:

```text
                 DVR
      original conversation evidence
                  |
                  v
                 DSH
       canonical session/context host
                  |
                  v
             ChatGPT Web
        high-quality reasoning brain
                  |
                  v
              WebCodex
      durable local execution/body
                  |
                  v
               Windows

Optional coding worker:
Codex / ACP
```

The most important sentence is:

> **The goal is not to preserve one ChatGPT Web window. The goal is to preserve the session, original evidence and execution reality outside the window, then keep using ChatGPT Web for the reasoning quality that made the window valuable in the first place.**

---

## Stage 12 — what must not be forgotten again

1. Same-window decay means this is not fundamentally a new/old-window problem.
2. Branching from the same correct historical node does not guarantee the same cognition.
3. Coding continuity is easier because code reality is external.
4. Multi-round cognitive re-induction was already tried and is not a durable root solution.
5. DVR is more valuable than checkpoint-only recovery because it replays original evidence.
6. DSH is promising because it can own the session; this is a hypothesis to test, not a proven cure.
7. ChatGPT Web remains the desired reasoning brain.
8. WebCodex remains the desired durable body/effect layer.
9. Codex remains useful as a coding worker, not assumed artistic cognition host.
10. Context projection, Web-conversation lifetime policy and DVR replay strategy are the next real research problems.


---

## Stage 13 — relay delegation exposed a lifecycle cost

The first transport-delegation move was still correct in one important sense:

> ChatGPT-specific DOM/send/reply behavior should not be reimplemented inside DSH.

The first implementation therefore used `Penrix/codex-chatgpt-web` through its
local Responses relay:

```text
DSH
→ dsh-chatgpt-web
→ 127.0.0.1:17841
→ Codex Web GPT Launcher
→ ChatGPT Web
```

A real Windows acceptance attempt then stopped before any model Send because
nothing was listening on 17841. Source inspection established that this was not
a relay-protocol failure: on Windows, the production Responses runtime was owned
by the Codex Web GPT Launcher and was intentionally shut down when the Launcher
quit.

That corrected an earlier hidden assumption:

```text
installed codex-chatgpt-web
≠
Responses daemon is always alive
```

The immediate architectural answer was ADR-0005: if DSH consumes that relay,
the Launcher owns its lifecycle.

Then a new product fact changed the route: keeping the full Codex Web GPT
desktop application resident materially slowed the owner's machine.

So the relay boundary stopped being a neutral implementation detail. It had a
real product cost.

## Stage 14 — separate transport ownership from desktop ownership

The next question was not “how do we make the Launcher lighter?” but:

> Can DSH use ChatGPT Web without requiring the Codex Web GPT desktop product at all?

External projects confirmed that “agent/runtime owns canonical state while a
dedicated browser transport treats ChatGPT Web as the reasoning surface” is a
real architecture shape.

More importantly, source inspection found that our own
`Penrix/codex-chatgpt-web` already contained the needed mechanism:
`ChatGptBrowserWorker` had a mature `managed-chrome` path that could launch
ordinary Chrome directly from persisted ChatGPT login state.

That changed the problem.

The correct move was **not**:

```text
copy the browser automation into DSH
→ create a second ChatGPT DOM implementation
```

It was:

```text
DSH owns Session / AgentLoop / provider lifecycle
→ dsh-chatgpt-web owns DSH prompt/result semantics
→ codex-chatgpt-web library owns ChatGPT browser protocol
→ ordinary managed Chrome
→ ChatGPT Web
```

This became ADR-0006.

The localhost relay and full desktop Launcher are therefore no longer part of
the primary product path. ADR-0005 remains historically correct for the old
relay shape, but it no longer defines the main runtime.

## Stage 15 — front-door self-audit removed migration residue

After the embedded path first compiled and passed ordinary CI, the
`ai-coding-cognition` front-door rules were replayed against the diff instead
of treating “green” as completion.

That audit found several residues which looked defensive but had no remaining
product owner:

- the old relay was still selectable from the production adapter/config even
  though no current product caller required it;
- live-test `SendSafetyLease` was exported from the production plugin only so
  the acceptance script could reach it;
- DSH duplicated Chrome executable discovery already owned by the embedded
  transport;
- an earlier direct-browser helper split (`chrome.ts`) remained in the diff
  even though the new path did not use it;
- M2 evidence text still named the retired `ChatGptBrowser.newTurnPage()`;
- the first reusable transport wrapper accidentally reused the upstream global
  worker cache, so two library owners could share lifecycle state;
- the wrapper constructed a full Codex runtime `AppConfig` merely to call
  browser-login helpers which only needed Chrome and storage-state paths;
- the first pack smoke ran inside a development install, so undeclared
  transitive runtime dependencies could be hidden by devDependencies.

The removal/reality pass therefore changed the implementation again:

- production relay/config branch removed; history stays in ADR/Git;
- acceptance-only pacing removed from the production plugin API;
- browser path discovery delegated to the transport unless the owner explicitly
  configures a path;
- unrelated direct-browser refactor restored to the pre-change baseline;
- the transport library now creates an independently owned worker instead of
  borrowing the server's global cache;
- browser-login contracts were narrowed to the fields they actually consume;
- final-package smoke now checks the emitted runtime dependency closure rather
  than only loading the build inside the development tree.

This stage matters because it records a recurring failure mode:

> **A technically working bridge can still violate the architecture if
> migration scaffolding quietly becomes permanent product structure.**

The current rule is therefore stronger than “reuse codex-chatgpt-web”:

> **Reuse the one authoritative ChatGPT browser transport through the smallest
> boundary that preserves its ownership, and delete every relay, wrapper,
> fallback or test-only state that no longer protects an observed requirement.**


---

## Stage 16 — repeated login exposed a second hidden source of truth

The first embedded Windows live acceptance never reached a model Send. It exposed
an earlier design mistake instead.

The machine already had authenticated ChatGPT state under the historical DSH
persistent profile:

```text
~/.dsh-chatgpt-web-penrix/chrome-profile/Default/Network/Cookies
```

The new embedded transport, however, declared the owner “logged in” only when
both of these new cache artifacts existed:

```text
chrome-profile/storage-state.json
chrome-profile/storage-state.json.verified.json
```

The live attempt also created a second persistent profile:

```text
chrome-profile/login-profile/Default/Network/Cookies
```

The owner signed in there, but the capture flow then required closing that
normal Chrome and reopening the profile before writing the storage-state cache.
The reopened page did not expose a visible composer, so the cache was never
written. On the next run the code would therefore say “not logged in” again even
though persistent browser cookies existed.

This revealed two separate mistakes:

1. **cache absence had been promoted into authentication truth**;
2. **the capture flow destroyed the live authenticated browser before persisting
   the state it needed**.

The corrected ownership is:

```text
persistent DSH Chrome profile
= durable login source

storage-state.json
= derived/rebuildable transport cache
```

The provider now:

- checks the existing historical DSH profile first;
- also recognizes the already-created `login-profile` as a migration/reuse
  candidate so the owner's latest sign-in is not wasted;
- derives verified transport storage from an authenticated persistent profile
  without asking the owner to sign in again;
- writes authentication proof before probing model/effort capabilities, so a
  capability-UI failure cannot erase a valid login;
- refuses to fall through to another automatic login prompt when existing
  profile evidence is present but reuse fails;
- uses a Playwright-owned persistent profile for a genuinely first login and
  captures state while that same authenticated browser is still alive.

The broader lesson is:

> **Changing a transport must not silently create a second account/session
> source of truth. Authentication is user-owned durable state, not disposable
> migration scaffolding.**
