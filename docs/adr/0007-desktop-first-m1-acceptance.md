# ADR-0007 — Make the real DSH Desktop the M1 acceptance entrypoint

Status: Accepted
Date: 2026-09-29

## Context

The embedded ChatGPT Web transport and DSH tool-loop harness became useful for isolating browser and provider failures, but that harness creates its own Cordis/DSH runtime in a terminal process. It proves real DSH libraries can drive the provider; it does not prove the product the owner actually uses.

DeepSeek Harness Desktop owns the reserved `$DSH_HOME/profiles/desktop`. Upstream DSH also supplies an installed Desktop command at `resources/runtime/cli/bin/dsh.cmd` that may manage that reserved profile while Desktop is fully quit. The npm-installed public CLI may not mutate it.

## Decision

M1 acceptance is Desktop-first:

```text
exact candidate tarball
→ Desktop-owned dsh.cmd installs into profiles/desktop
→ reopen real Desktop
→ Desktop model selector discovers chatgpt-web/*
→ one plain Desktop ChatGPT Web inference
→ same real Desktop path performs the DSH tool round-trip
```

Rules:

1. `m1-embedded-e2e-live.mjs` remains an internal diagnostic only.
2. Desktop profile mutation uses only Desktop-owned package-management surfaces.
3. Scripted installation fails if Desktop is still running; it never kills the app automatically.
4. The real plugin defaults to `allowInteractiveLogin=false`; existing login is reused or the provider fails closed. Re-authentication is an explicit repair action, not a fallback.
5. Provider/model discovery is proved before spending any ChatGPT Web model quota.
6. The first Web Send for M1 product acceptance originates from the real Desktop.
7. ADR-0006 transport ownership, post-Send ambiguity, DSH Session authority, tool validation and retry boundaries remain unchanged.

## Consequences

The acceptance evidence now matches the actual product entrypoint. Installation/composition failure is separated from browser/provider failure, and repeated sign-in prompts cannot silently reappear merely because execution moved from the diagnostic harness into Desktop.

The current candidate remains CODE VERIFIED, LIVE UNVERIFIED until the owner's real Desktop completes this flow.

## Rejected alternatives

- Keep the terminal harness as primary acceptance: it bypasses Desktop composition and UI.
- Hand-edit `profiles/desktop`: Desktop already owns package management, locking and reconciliation.
- Use npm-installed `dsh` for the Desktop profile: upstream explicitly reserves that profile for the Desktop-installed command.
- Automatically kill Desktop before install: expose the lifecycle violation as a blocker instead of taking an unrelated destructive action.
