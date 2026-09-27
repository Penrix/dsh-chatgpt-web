# ADR-0003 — Delegate ChatGPT Web transport to codex-chatgpt-web

Status: Accepted  
Date: 2026-09-27

## Context

The project needs DSH to own the long-lived Session and tool loop while continuing to use ChatGPT Web as the reasoning brain.

An early implementation interpretation turned this logical requirement into a physical one:

```text
DSH
→ its own Playwright/Chrome transport
→ ChatGPT Web
```

That interpretation produced a direct browser path in `dsh-chatgpt-web`. It also led several later M1 packets to spend substantial effort on ChatGPT UI details: Send boundaries, page pacing, rate-limit surfaces, reply selectors and completion detection.

The 2026-09-27 reassessment was triggered by a repeated real-Windows symptom: ChatGPT Web visibly answered quickly, while the provider could continue waiting for many minutes.

The current direct-browser candidate explains how that can happen. Its turn loop primarily observes:

- assistant DOM count relative to a baseline;
- visibility of the Stop button;
- the last assistant turn's visible text;
- a short text-stability window;

while the configured turn timeout can be much longer. If the live ChatGPT DOM no longer matches the assumed assistant selector/identity shape, a human can see a completed reply while the provider still considers the turn unfinished.

A comparison against `Penrix/codex-chatgpt-web` then exposed a more important fact: this project had reused some surface/session code from that repository, but not the mature transport machinery that actually handles the hard Web boundary.

`codex-chatgpt-web` already has a local Responses surface and specialized ChatGPT Web transport that includes, among other things:

- prompt-attachment verification;
- semantic submission-acceptance evidence;
- per-turn identity/baseline tracking;
- assistant-turn binding and rebinding;
- DOM mutation observation and recovery;
- richer completion evidence;
- Responses parsing/bridging back to the caller.

Its Responses parser statically accepts the ordinary fields needed for a thin provider experiment such as `model`, `instructions`, `input` and tool definitions. That does **not** yet prove that DSH can use the relay unchanged; the DSH-to-Responses mapping and Windows live path remain to be verified.

This changed the engineering question from:

> How do we keep fixing our direct DSH browser driver?

to:

> Why should DSH own a second ChatGPT-specific browser transport when a specialized one already exists and has already run successfully in our environment?

## Decision

Keep the authority model from ADR-0001, but split **provider authority** from **browser transport ownership**.

The intended primary path is:

```text
DSH Session / Agent Loop
        │
        │ DSH-facing provider semantics
        ▼
Penrix/dsh-chatgpt-web
        │
        │ Responses request/result mapping
        ▼
Penrix/codex-chatgpt-web
        │
        │ specialized ChatGPT Web transport
        ▼
ChatGPT Web
```

On the action side:

```text
ChatGPT Web result / action intent
        ↓
DSH validates and owns the tool loop
        ↓
DSH ToolRuntime
        ↓
WebCodex-backed tools
        ↓
authoritative local result
        ↓
DSH Session
        ↓
next model inference
```

Therefore:

1. **DSH remains the canonical Session, history and tool-loop authority.**
2. **`dsh-chatgpt-web` remains the DSH-facing semantic integration layer.** It maps DSH messages, provenance, tool schemas and results to/from the model transport.
3. **`codex-chatgpt-web` becomes the preferred owner of ChatGPT-specific browser transport on the primary path.**
4. **WebCodex remains the durable local body/effect authority.** It is not inserted as a generic browser bridge to ChatGPT merely because it has browser/computer capabilities.
5. The existing direct-browser M1 path is retained as historical evidence, fallback/control material and a source of safety lessons, but it is **frozen as the default direction** while the relay path is tested.
6. Do not continue selector-by-selector investment in the direct-browser primary path unless new evidence shows the relay approach is infeasible or violates a required invariant.
7. The first implementation proof is intentionally thin:
   - statically map DSH `GenerateOptions` to the relay's Responses contract;
   - run one real Windows inference such as “reply exactly OK”;
   - then prove one harmless DSH tool call, durable tool result and second inference.
8. This ADR is an architecture decision, **not a LIVE VERIFIED claim**. The relay integration is still unverified until the above proof succeeds.

The phrase “DSH directly calls ChatGPT Web” should henceforth mean **DSH is the caller and authority at the provider boundary**, not “DSH must personally drive the ChatGPT DOM.”

## Consequences

Positive:

- ChatGPT-specific DOM knowledge has one preferred owner instead of two competing implementations;
- hard-won transport behavior from `codex-chatgpt-web` can be reused as a component rather than copied piecemeal;
- DSH can focus on session/provenance/tool semantics;
- WebCodex can focus on effect truth;
- future ChatGPT UI changes should primarily be absorbed by the specialized Web transport layer;
- the real system can be tested one seam at a time: model transport first, DSH tool loop second, WebCodex body third.

Costs and risks:

- the final product now depends on a local transport process/component boundary;
- request/response compatibility between DSH and the relay must be made explicit and tested;
- the relay must not accidentally transfer canonical Session or tool-loop authority to Codex;
- lifecycle, packaging and update coordination between the two repositories become real integration concerns;
- a successful `/v1/responses` text turn still does not prove high-semantic cognition continuity.

## Rejected alternatives

### Continue the bespoke DSH browser transport as the primary path

Rejected as the default direction because it duplicates the hardest ChatGPT-specific transport work and has already produced repeated live debugging around UI details that the specialized transport handles more deeply.

The existing code is not declared worthless; it remains a fallback/control and a source of safety behavior such as fail-closed Send semantics.

### Put WebCodex between DSH and ChatGPT Web

Rejected as the primary model-transport design.

WebCodex has strong Browser/Computer/Runner capabilities, but its architectural job here is durable local execution. Using a generic body layer to recreate ChatGPT-specific turn transport would blur responsibilities and still require us to solve ChatGPT submission/reply semantics.

### Let Codex own the whole agent loop because codex-chatgpt-web already integrates with Codex

Rejected.

The reason to use `codex-chatgpt-web` is its specialized transport. DSH must still own canonical history, context construction and the tool/result loop.

### Copy more browser-worker code into dsh-chatgpt-web

Rejected as the first move.

Prefer a stable process/API seam over creating a second fork of a fast-moving ChatGPT Web transport. Copy code only if the relay experiment proves a concrete integration gap that cannot be solved through the existing boundary.
