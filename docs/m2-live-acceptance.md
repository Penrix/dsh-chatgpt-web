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

## Live evidence status

No live behavior is claimed merely because this document or a harness exists. Until a signed-in Windows/browser run is actually executed, every acceptance item above remains **未执行**.

The first real blocker, if any, must be recorded without repairing M1/provider code in this branch.
