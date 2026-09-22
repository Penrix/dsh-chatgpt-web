# WEB-M2-LIVE-004 live acceptance

Starting point: `web-m2-002-contract@8607227e49838011eb4f2bd0533ba1dfb0349861`.

This leaf exists only to execute and record the first real meow-memory end-to-end run through the ChatGPT Web provider. It does not replace DSH Session history with memory state and it does not use ChatGPT Web conversation persistence as continuity.

## Truth surfaces

Evidence must be kept separate:

1. **DSH Session** — canonical `turn/*`, `user/message`, `assistant/message`, `tool/call`, `tool/result`, `compaction/*` events.
2. **meow-memory** — SQLite/session-side persisted memory and plugin messages whose source is `{ kind: "plugin", plugin: "meow-memory" }`.
3. **Provider/browser** — the real `chatgpt-web` adapter request plus successful Temporary Chat browser inference.
4. **Derived acceptance summary** — assertions calculated from 1-3; never treated as original history.

## Required live sequence

The run must use one canonical DSH Session and the real published `meow-memory@0.27.0`.

- First normal turn: prove a `meow-memory` snapshot is present in the provider request as passive plugin context while `compilePrompt().targetMessageIndex` still selects the genuine human request.
- Exercise ordinary DSH tool execution for `memory_search`, `memory_project`, `memory_read`, `memory_remember`, and `memory_update`. For each call, preserve the matching `tool/call` + `tool/result` event sequence and show the next provider inference receives that tool result in the same Session.
- Persist one uniquely identifiable memory.
- Keep the DSH Session and make a later inference through another fresh Temporary Chat page. Retrieve/use that memory again. The provider already opens and closes a fresh page per inference; no ChatGPT Web conversation is reused.
- Run real DSH compaction. Require a successful `compaction/end` and then prove the next genuine user turn contains a meow `snapshot` with reinjection metadata.
- Exercise meow reflection through the real provider and identify the plugin reflection message separately from genuine human input.
- Enable/dogfood automatic dream. If the known busy-turn collision happens, stop at that first blocker and record the precise Session/provider event order.

## Local composite rule

Remote commits on this branch remain M2-only. A Windows live run may use a temporary worktree composed from:

- this branch,
- accepted M1 PR #10 delta,
- accepted M1 PR #11 delta,

or WEB-M1-LIVE-008 once available. The composite SHA/state must be written into the delivery receipt; none of #5/#10/#11/#12 is modified from this branch.

## Executable Windows path

From a Windows checkout of this repository, run:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\m2-live-composite.ps1
```

Optional parameters:

- `-ProfileDir <path>` — dedicated signed-in ChatGPT Chrome profile; otherwise the provider's Penrix profile path is used.
- `-Model chatgpt-web/high` — provider model route.
- `-EvidencePath <path>` — explicit machine-readable evidence JSON destination.
- `-KeepWorktree` — retain the temporary composite for diagnosis.

The composite runner fetches and SHA-pins accepted M1 PR #10/#11, applies only their expected paths into a detached temporary worktree, runs install/typecheck/tests/build/load/pack, then starts `npm run m2:live`. It never writes those M1 deltas back to this branch.

The live runner itself:

- verifies the installed upstream manifest is exactly `meow-memory@0.27.0`;
- records the real seven-tool registry through an injected `tools` probe;
- uses a real seed DSH Session to create first-turn memory state without direct DB manipulation;
- uses a separate canonical main DSH Session for all acceptance assertions;
- observes real `llm/stream` requests without modifying them and delegates to the real ChatGPT Web adapter;
- records every required tool call/result and verifies the next inference contains that tool result;
- checks the SQLite file exists and remains non-empty without treating the DB as original history;
- runs real `compactNow()`, then requires a `reinjection` snapshot on the next genuine user turn;
- triggers real meow reflection with one benign non-memory DSH tool;
- enables automatic dream and queues a genuine user prompt when the dream request starts to dogfood the busy-turn edge;
- writes the first exact blocker plus Session/provider event order to evidence JSON and exits nonzero on a blocker.

## Live evidence status

**Live Windows/browser acceptance is still 未执行 in the current ChatGPT execution environment.** No live behavior is claimed merely because the harness exists.

The current execution environment is not the product environment required by this packet: it has no access to the user's Windows desktop, dedicated signed-in ChatGPT browser profile, or interactive browser session. Its shell also cannot resolve `github.com` (a direct `git ls-remote` probe failed with `Could not resolve host: github.com`), so it cannot independently run the package install/regression suite either.

This is an **execution-environment blocker, not an observed M1/provider product blocker**. No M1/provider repair is made on this branch. The first product blocker, if one occurs during the Windows run, must be recorded by the evidence JSON and delivered without repairing M1 here.
