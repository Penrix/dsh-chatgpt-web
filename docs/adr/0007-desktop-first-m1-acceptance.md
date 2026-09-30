# ADR-0007 — Make the real DSH Desktop the M1 acceptance entrypoint

Status: Accepted  
Date: 2026-09-29  
Updated: 2026-09-30

## Context

The embedded ChatGPT Web transport and DSH tool-loop harness are useful diagnostics, but they create their own DSH runtime in a terminal process. They cannot prove the product the owner actually uses.

Official DeepSeek Harness Desktop already owns package installation for its live profile through the sidebar **Plugins** page. **Add plugin** accepts a package name, Git address, tarball, or absolute local path; the Host inspects the spec, owns package/profile mutation and compatibility checks, rolls back failed installs, and offers **Enable now** after success.

A previous acceptance path inserted the Desktop-managed `dsh` CLI between the candidate tarball and Desktop. That added a carrier/preference problem which is not part of the product goal and already consumed an unnecessary owner-machine run.

## Decision

M1 acceptance is Desktop-first and Plugins-UI-first:

```text
exact candidate tarball
→ official Desktop sidebar Plugins
→ Add plugin with exact local .tgz path
→ Install
→ Enable now
→ Desktop model selector discovers chatgpt-web/*
→ one plain Desktop ChatGPT Web inference
→ same real Desktop path performs the DSH tool round-trip
```

Rules:

1. `m1-embedded-e2e-live.mjs` remains an internal diagnostic only.
2. The official Desktop **Plugins** page is the primary package/profile mutation authority for M1 acceptance.
3. `scripts/m1-local.ps1` may stage, verify, emit the exact UI install plan, and read back profile state; it must not install the Desktop plugin itself.
4. The Desktop-managed `dsh` command is an optional maintenance surface, not a prerequisite for M1 acceptance.
5. The real plugin defaults to `allowInteractiveLogin=false`; existing login is reused or the provider fails closed.
6. Provider/model discovery is proved before spending any ChatGPT Web model quota.
7. The first Web Send for M1 product acceptance originates from the real Desktop.
8. ADR-0006 transport ownership, post-Send ambiguity, DSH Session authority, tool validation and retry boundaries remain unchanged.

## Consequences

Installation/composition failures are now separated cleanly from Web transport failures without introducing a CLI-carrier prerequisite.

The owner should not spend local Codex/model quota on CI-owned checks or on proving a command carrier when the Desktop UI already owns installation.

The current candidate remains **CODE VERIFIED, LIVE UNVERIFIED** until the owner's real Desktop completes this flow.

## Rejected alternatives

- Keep the terminal harness as primary acceptance: it bypasses Desktop composition and UI.
- Hand-edit `profiles/desktop`: Desktop already owns package management, locking and reconciliation.
- Require the Desktop-managed `dsh` CLI before installation: unnecessary indirection for the M1 product path.
- Use an ordinary npm-installed `dsh` for the Desktop profile: official DSH correctly refuses the Electron-owned profile.
