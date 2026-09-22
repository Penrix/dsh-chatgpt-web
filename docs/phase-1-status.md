# Phase 1 status

> Branch: `phase-1-fresh-inference`
>
> Status date: 2026-09-22
>
> This file is intentionally explicit about what exists versus what has actually been executed.
>
> **2026-09-22 scope update:** the earlier long-term-memory A/B gate is superseded. `Phant0Meow/dsh-meow-memory` is adopted as the structured memory layer. The branch's next blocker is the DSH tool loop needed to let ChatGPT Web use `memory_*` tools through DSH.

## Implemented on the branch

- DSH-native `LlmAdapter` provider route: `chatgpt-web`.
- Explicit model routes:
  - `chatgpt-web/luna`
  - `chatgpt-web/think`
  - `chatgpt-web/light`
  - `chatgpt-web/medium`
  - `chatgpt-web/high`
  - `chatgpt-web/extra-high`
  - `chatgpt-web/pro`
- Dedicated persistent Chrome/Edge profile for login state.
- Fresh ChatGPT Temporary Chat page for every DSH inference.
- DSH current visible history serialized into an explicit JSON envelope every inference.
- No managed ChatGPT conversation URL or provider-side conversation identity.
- Explicit account capability probe + model/effort selection.
- Positive completion conditions:
  - new assistant turn;
  - generation stopped;
  - non-empty text;
  - new copy action;
  - stable text window.
- HTML-to-Markdown final extraction.
- Serialized browser requests.
- Abort/timeout handling.
- Post-Send fail-closed boundary: once Send may have happened, the adapter returns provider uncertainty rather than automatically resending.
- Unit-test source for:
  - completion stability;
  - prompt history/targeting;
  - model/effort mapping.

## Deliberately not implemented yet

- DSH tool-call bridge — **next implementation slice**.
- ChatGPT native MCP connector — not required for the ordinary DSH/meow-memory tool loop.
- long-lived managed Web conversation.
- DVR lookup.
- WebCodex integration.
- semantic/vector retrieval.
- browser worker pool.
- image input/output.

## meow-memory compatibility already added at the prompt boundary

The provider now preserves DSH message provenance instead of collapsing it to `role` only.

In particular:

```text
source.kind=user
→ genuine human request

source.kind=plugin, plugin=meow-memory
→ memory snapshot/notice/context
```

The outer transport contract explicitly instructs ChatGPT Web to use plugin
messages as context while answering the newest genuine human message.

A focused test fixture for a meow-memory plugin snapshot has been added, but
the test has not yet been executed in a local checkout.

## Validation actually completed

Completed:

- GitHub source/diff review.
- authority-boundary review.
- retry/no-resend review.
- license review for imported selector code.
- branch is based cleanly on current main and contains only Phase-1 implementation changes.

Not completed yet:

- dependency installation;
- TypeScript `typecheck`;
- unit-test execution;
- package build;
- real DSH plugin load;
- real Windows browser login;
- live ChatGPT Web turn;
- 10-turn continuity smoke;
- male-channel A/B cognition experiment.

No GitHub Actions were started.

## Known risks before live smoke

### 1. DSH package compatibility

The code targets the current public `LlmAdapter` contract and uses
`@deepseek-ai/dsh-llm` alpha-era development dependencies.

The exact locally installed DSH version still needs to be proven.

### 2. Persistent-context browser behavior

The first skeleton uses Playwright `launchPersistentContext` rather than
Twilight's more mature shared headed-hidden daemon.

This is intentionally simpler for the first proof, but Windows/Cloudflare/UI
behavior must be tested on the user's machine.

If needed, the next transport hardening step is to import/adapt Twilight's
daemon lifecycle instead of inventing a second one.

### 3. DOM changes

ChatGPT Web UI is not a stable public API.

The imported model/effort selectors are isolated under `src/chatgpt/` so
provider/session code does not need to know ChatGPT DOM details.

### 4. Model route observation

The adapter actively selects the requested model/effort, but live smoke still
needs to verify that the actual responding model matches the intended route
where the Web UI exposes such evidence.

### 5. Prompt budget vs cognition quality

The first provider sends DSH's entire **active** history, not the entire
append-only lifetime and not the external DVR.

This is deliberate. It lets the first experiment isolate whether moving
canonical state into DSH + fresh Web inference helps before introducing a
retrieval system.

## Next acceptance sequence

1. Install dependencies in a local checkout.
2. Run `npm run typecheck`.
3. Run `npm test`.
4. Load the plugin into DSH.
5. Sign in with the dedicated profile.
6. Run one `chatgpt-web/high` turn.
7. Verify a second DSH turn sees the first turn only through the DSH envelope, not a retained Web conversation.
8. Run 10 sequential turns.
9. Implement `final | action_proposal` tool-loop parsing/validation and emit ordinary DSH tool-call chunks.
10. Install `meow-memory@0.27.x` as a sibling DSH plugin and verify first-turn injection.
11. Exercise `memory_search`, `memory_project`, `memory_remember`, and `memory_update` through the ChatGPT Web provider.
12. Verify post-compaction reinjection.
13. Test the known dream/busy-turn steering edge (#20) before relying on unattended automatic dream.
14. Connect WebCodex tools as the durable body.

The old A/B cognition experiment remains useful for tuning, but is no longer an architectural gate.
