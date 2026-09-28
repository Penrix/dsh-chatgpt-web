# ADR-0006 — Embed the mature ChatGPT Web transport in the DSH provider

Status: Accepted
Date: 2026-09-28

## Context

ADR-0004 correctly moved ChatGPT-specific browser transport ownership away from
the bespoke DSH browser driver and toward `codex-chatgpt-web`.

The first implementation used that transport through its local Responses server:

```text
DSH
→ dsh-chatgpt-web
→ 127.0.0.1:17841
→ Codex Web GPT Launcher
→ ChatGPT Web
```

ADR-0005 documented the real Windows lifecycle of that relay shape. It remains
historically correct: the production Launcher owns its browser host and shuts
the Responses runtime down when the Launcher exits.

The owner then supplied a new product constraint: keeping the full Codex Web GPT
desktop application running materially degrades this Windows machine. That made
the relay process boundary itself a product cost rather than a neutral
implementation detail.

Source inspection found a simpler existing reality inside
`codex-chatgpt-web`: its mature `ChatGptBrowserWorker` already supports a
`managed-chrome` mode that launches ordinary Chrome directly from stored
ChatGPT login state. The hard transport behavior is not inherently tied to the
Electron Launcher or to the Responses HTTP server.

## Decision

The primary DSH path will reuse the existing mature
`codex-chatgpt-web` browser transport **as a library**, with DSH owning its
provider lifecycle.

```text
DSH Session / AgentLoop
        ↓
@penrix/dsh-chatgpt-web
        ↓
embedded codex-chatgpt-web managed-Chrome transport
        ↓
ChatGPT Web
```

Authority remains:

- DSH owns canonical Session/history;
- DSH owns tool validation and execution;
- `dsh-chatgpt-web` owns DSH-facing prompt/result semantics;
- the reused `codex-chatgpt-web` module owns ChatGPT-specific browser
  submission, model/effort selection, reply binding and completion;
- WebCodex remains the later local effect/body authority.

Rules:

1. Do not copy the mature ChatGPT DOM transport into this repository.
2. Do not make Codex Web GPT Desktop/Launcher a prerequisite of the primary DSH
   path.
3. Do not require the localhost Responses server on the primary path.
4. Launch the embedded browser transport lazily, only when a real inference is
   requested.
5. Reuse the mature transport's login capture and persisted ChatGPT session.
6. Keep browser submission/retry/ambiguity authority in the reused transport;
   DSH must not add a second production Send state machine around it.
7. DSH host retries remain disabled for this provider.
8. The old relay remains historical evidence in ADR-0004/ADR-0005 and Git
   history; after the embedded path became the primary candidate, the
   complexity-gate removal pass removed it from the production adapter/config
   instead of keeping a legacy diagnostic branch.
9. Real ChatGPT quota is reserved for a later end-to-end acceptance after code
   and packaging evidence are green.

## Why this supersedes ADR-0005

ADR-0005 answered:

> Who owns lifecycle if DSH consumes the Launcher-owned 17841 relay?

Answer: the Codex Web GPT Launcher.

That remains true for the relay path.

This ADR changes the primary product path so that the Launcher-owned relay is no
longer required. DSH now owns when its provider transport exists, while the
specialized transport library continues to own the browser protocol itself.

## Consequences

Positive:

- no full Codex Web GPT desktop process must remain resident merely for DSH;
- no second ChatGPT DOM implementation is created;
- no HTTP relay lifecycle has to be supervised by DSH;
- the browser can exist only while the DSH provider needs it;
- the same transport improvements can continue to live in one upstream
  implementation.

Costs:

- `dsh-chatgpt-web` now has a pinned source dependency on the reusable
  `codex-chatgpt-web` transport entry;
- packaging must prove that the Node/DSH artifact can load that transport
  without Bun or the desktop Launcher at runtime;
- first-use login must be supported directly by the provider;
- the embedded Windows path remains LIVE UNVERIFIED until one meaningful
  end-to-end DSH tool round succeeds.

## Rejected alternatives

### Keep the full Codex Web GPT desktop app resident

Rejected because the owner observed material machine slowdown and DSH does not
need the desktop product UI or Codex route management.

### Build a lightweight Electron Launcher first

Rejected as unnecessary at this stage. The mature browser worker already has a
managed-Chrome path. Creating another desktop shell would add lifecycle and UI
code before proving a need.

### Reimplement ChatGPT Web automation inside DSH

Rejected because the earlier bespoke DSH browser path already demonstrated the
cost of duplicating reply/submission semantics. The mature transport has the
stronger evidence base.

### Copy the transport source into dsh-chatgpt-web

Rejected because it creates two owners for fast-moving ChatGPT Web behavior.
A library dependency preserves one implementation and one maintenance point.
