# Phase 1 status

> Branch: `phase-1-fresh-inference`
>
> Status date: 2026-09-22
>
> This file is intentionally explicit about what exists versus what has actually been executed.
>
> **2026-09-22 scope update:** the earlier long-term-memory A/B gate is superseded. `Phant0Meow/dsh-meow-memory` is adopted as the structured memory layer.
>
> **Issue #1 static implementation update:** the DSH tool-loop adapter path is now implemented in source: exact `ToolSchema` data is sent to ChatGPT Web, strict `final | action_proposal` output is parsed, proposal arguments are validated with DSH's own JSON-Schema validator, and valid proposals are translated into native DSH `tool-call` chunks. This is **not yet runtime-validated**.

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
- Strict DSH reasoning result protocol:
  - exactly one `final` or one `action_proposal`;
  - no prose around the outer JSON envelope;
  - unknown tools rejected;
  - proposal arguments validated against the exact DSH `ToolSchema`;
  - valid proposals translated to native DSH `tool-call` blocks;
  - tool-call arguments remain raw JSON strings.
- Auxiliary DSH calls (`compaction` / `session-title`) are final-only even when DSH carries tool schemas for request-prefix reasons.
- DSH provenance target selection distinguishes:
  - human user turns;
  - passive plugin context (instructions/catalog/snapshot/notice/recall);
  - task-bearing plugin turns (opaque/no-form or relay), including meow-memory reflection/dream;
  - tool-result evidence.
- Unit-test source for:
  - completion stability;
  - prompt history/targeting;
  - model/effort mapping;
  - strict reasoning-envelope parsing;
  - DSH JSON-Schema proposal validation;
  - meow-memory array arguments;
  - tool-result history;
  - compaction/session-title isolation;
  - passive memory context vs reflection/dream task turns.

## Deliberately not implemented yet

- Real DSH runtime validation of the tool-call bridge — **next blocker**.
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

The outer transport contract preserves DSH source provenance. Passive plugin forms
are contextual, while task-bearing plugin turns remain eligible as the current
task. This is required because meow-memory snapshot/notice injection is passive,
but reflection/dream prompts are plugin-sourced user turns with no passive form.

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

### Current-environment validation attempt

A local checkout/test run was attempted after the static implementation work.
The current execution environment could not resolve `github.com`, so it could
not clone the branch and therefore could not truthfully run `npm install`,
`typecheck`, tests, or build here.

This is an environment/network limitation, not a passing or failing result for
the code. The next real validation must happen in a network-capable local
checkout / the user's Windows environment.

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
9. Load one harmless DSH test tool and prove ChatGPT Web emits a native DSH tool call, DSH executes it, records the tool result, and calls the provider again.
10. Install `meow-memory@0.27.x` as a sibling DSH plugin and verify first-turn injection.
11. Exercise `memory_search`, `memory_project`, `memory_read`, `memory_remember`, and `memory_update` through the ChatGPT Web provider.
12. Verify post-compaction reinjection.
13. Verify reflection turns target the plugin task rather than the earlier human turn.
14. Test the known dream/busy-turn steering edge (#20) before relying on unattended automatic dream.
15. Connect WebCodex tools as the durable body.

The old A/B cognition experiment remains useful for tuning, but is no longer an architectural gate.
