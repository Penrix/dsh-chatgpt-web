# Phase 1 status

> Branch: `phase-1-fresh-inference`
>
> Status date: 2026-09-22
>
> This file is intentionally explicit about what exists versus what has actually been executed.

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

## Deliberately not implemented

- DSH tool-call bridge.
- ChatGPT native MCP connector.
- long-lived managed Web conversation.
- DVR lookup.
- WebCodex integration.
- semantic/vector retrieval.
- browser worker pool.
- image input/output.

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
9. Run the fixed high-semantic A/B experiment from `docs/phase-1.md`.

A failed step should be fixed before moving to the cognition experiment; a
technical failure is not evidence for or against the cognitive hypothesis.
