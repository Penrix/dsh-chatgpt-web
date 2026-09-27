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

## Stage 13 — a sequencing question reopened the transport assumption

After several days of Windows M1 work, the immediate question was whether the project should first finish:

```text
Web → WebCodex
```

or:

```text
DSH → Web
```

before attempting the full chain.

Re-reading the original roadmap showed that the intended milestone order had been:

```text
M1  DSH ↔ ChatGPT Web
M2  meow-memory
M3  WebCodex body
```

That part was not itself wrong.

The hidden assumption inside M1 was the problem.

“DSH ↔ ChatGPT Web” had quietly become equivalent to:

```text
DSH itself owns the browser
and directly implements ChatGPT DOM send/reply semantics
```

The roadmap had specified the **logical seam**, but later implementation treated one particular transport mechanism as if it were part of the product requirement.

This distinction had not been made explicit enough.

---

## Stage 14 — the live symptom made the assumption suspicious

The user challenged the current direction using concrete behavior from repeated Windows tests:

> ChatGPT Web visibly replies almost immediately, yet the program can keep waiting for a long time and report that it cannot see the reply.

This mattered because the problem was no longer “some obscure edge case”.

It suggested that the project might be spending most of its effort debugging a fragile observation layer rather than proving the DSH architecture.

The correct next move was not another selector guess.

It was to inspect what the current transport actually does and compare it with already-working code we own.

---

## Stage 15 — Reality check of the direct-browser M1

The current M1 candidate was inspected rather than trusting the accumulated task contracts.

Its primary path is:

```text
DSH
→ ChatGptWebAdapter
→ ChatGptBrowser
→ runFreshTurn()
→ Playwright
→ chatgpt.com
```

After Send, the simplified completion logic mainly relies on:

```text
assistant DOM count increased
+ Stop button no longer visible
+ last assistant text is non-empty
+ text remains stable for a short period
```

The configured turn timeout can be much longer than the visible reply latency.

This gives a concrete failure mechanism for the observed symptom:

```text
ChatGPT has visibly answered
but the assumed assistant identity/selector does not match the live DOM
→ provider never sees assistantCount advance
→ provider keeps waiting
```

Recent work such as reply-detection selector changes was therefore treating the symptom locally.

Those patches may be valid within the direct-browser implementation, but they do not answer the larger question:

> Why are we maintaining a second ChatGPT Web transport at all?

---

## Stage 16 — comparison with codex-chatgpt-web exposed shallow reuse

The next comparison was against `Penrix/codex-chatgpt-web`, which had already been run successfully in the user's environment.

The surprising result was not that the repositories were unrelated.

`dsh-chatgpt-web/src/chatgpt/session.ts` explicitly says that it was vendored from `codex-chatgpt-web`.

So the earlier work **did** know about the project.

But it reused mostly surface/session pieces such as selectors and effort controls, while leaving behind much of the transport machinery that makes the working bridge robust.

The specialized implementation contains concepts such as:

- prompt attachment integrity;
- semantic submission acceptance;
- baseline turn identities;
- assistant-turn binding/rebinding;
- MutationObserver-based response snapshots;
- DOM recovery;
- explicit completion actions;
- richer response streaming/translation;
- a local Responses bridge.

This produced a new diagnosis:

> The mistake was not “we forgot codex-chatgpt-web exists”. The mistake was **reusing the easy layer while independently rebuilding the hard layer**.

That is a more useful lesson than blaming any one broken selector.

---

## Stage 17 — fourth major correction: provider authority is not transport ownership

A key conceptual distinction was then made.

We still want:

```text
DSH
= canonical session / context / tool-loop authority

ChatGPT Web
= reasoning brain
```

But that does **not** require:

```text
DSH code
= owner of ChatGPT-specific DOM automation
```

The cleaner separation is:

```text
DSH
   │
   │ provider semantics / Responses request
   ▼
dsh-chatgpt-web
   │
   │ transport seam
   ▼
codex-chatgpt-web
   │
   │ specialized browser transport
   ▼
ChatGPT Web
```

and independently:

```text
DSH tool loop
   ↓
WebCodex
   ↓
Windows / files / Git / shell / jobs
```

This also corrected a tempting alternative: WebCodex should not be used merely as a generic bridge from DSH to ChatGPT Web. Its browser/computer abilities do not make it the natural owner of ChatGPT-specific turn semantics.

The components now have cleaner jobs:

```text
DSH
= who the long-lived agent/session is

codex-chatgpt-web
= how we reliably talk to the Web brain

ChatGPT Web
= the brain

WebCodex
= how the agent affects local reality

DVR / meow-memory
= original evidence and structured durable memory
```

---

## Stage 18 — new engineering hypothesis, not yet a live result

Static inspection showed that `codex-chatgpt-web` already exposes a local `POST /v1/responses` path and parses ordinary Responses-style fields including model, instructions, input and tools.

That makes the smallest next experiment:

```text
DSH
→ dsh-chatgpt-web semantic adapter
→ codex-chatgpt-web /v1/responses
→ ChatGPT Web
→ Responses result
→ DSH
```

First proof:

```text
DSH asks: reply exactly OK
→ ChatGPT Web answers
→ DSH receives OK
```

Second proof:

```text
DSH exposes harmless tool
→ ChatGPT Web proposes/calls it
→ DSH executes it
→ tool result enters the same canonical Session
→ second inference reaches final
```

Only after those should WebCodex be added to the same tool universe.

Important evidence discipline:

> This is the current preferred engineering direction, not a claim that the relay path is already LIVE VERIFIED.

The direct-browser implementation should therefore be frozen as the default investment path while this experiment is performed. If the relay fails for a concrete reason, that evidence can reopen the decision.

---

## Stage 19 — what this discussion added to the durable model

The discussion did not replace the existing authority architecture. It sharpened it.

The durable conclusions are now:

1. The original M1 milestone — prove DSH ↔ ChatGPT Web before WebCodex — was conceptually sound.
2. The phrase “DSH directly calls ChatGPT Web” was underspecified and was incorrectly allowed to harden into “DSH must own browser automation”.
3. Logical provider authority and physical transport ownership are different concerns.
4. `codex-chatgpt-web` is not merely reference code; it is now the preferred specialized transport component to integrate first.
5. Reusing a few selectors from a mature transport is not meaningful reuse if the difficult send/identity/completion machinery is rebuilt independently.
6. WebCodex is still required, but as the body/effect authority behind DSH tools, not as a substitute Web transport.
7. DSH must still own the tool loop even when `codex-chatgpt-web` is used for transport; we are borrowing the wire, not Codex's agent authority.
8. The shortest Reality test is no longer another selector patch. It is a thin DSH → Responses relay → Web → DSH spike.
9. A successful text relay would prove only model transport. It would not yet prove DSH tool-loop correctness, WebCodex integration, memory continuity or high-semantic cognition stability.
10. Future task contracts must re-check component boundaries against current code before extending a debugging path merely because earlier packets assumed it.


---

## Stage 20 — another simplification: we need the Web transport, not Codex Full Harness

The comparison with `codex-chatgpt-web` exposed one more important distinction.

That project has two very different capability levels:

```text
browser-only
= use ChatGPT Web as a model transport

Full Harness
= connect ChatGPT back to Codex-local tools through the official tunnel/connector path
```

Our DSH architecture does not need the second capability for M1.

DSH already owns:

- the canonical Session;
- the exposed tool schemas;
- tool validation;
- tool execution;
- tool-result reintegration.

Therefore the first integration should deliberately avoid turning this into:

```text
DSH
→ codex-chatgpt-web
→ ChatGPT-native MCP
→ Codex tools
```

That would reintroduce the wrong authority.

The desired path is thinner:

```text
DSH prompt + data-only tool/action contract
→ codex-chatgpt-web browser transport
→ ChatGPT Web
→ model text/action proposal
→ DSH ToolRuntime
```

This also means the user's lack of interest in depending on the official Codex MCP/tunnel path is not a blocker for the transport experiment. The transport and the local-tool harness are separable concerns.

---

## Stage 21 — WebCodex is still later in the loop, not missing from the design

The sequencing question also risked creating another false binary:

```text
either solve DSH → Web first
or solve Web → WebCodex first
```

But WebCodex already has a defined role and active-branch integration work has produced a thin DSH/WebCodex seam such as project/file read.

So the architecture does not need WebCodex to mediate the model call.

The correct dependency shape remains:

```text
first:
DSH ↔ ChatGPT Web transport

then:
DSH tool loop

then:
DSH tools backed by WebCodex
```

This keeps the two hard boundaries independent:

```text
brain transport
≠
body/effect transport
```

A failure in one should not force the other component to absorb the wrong responsibility.
