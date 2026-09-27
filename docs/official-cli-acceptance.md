# Official DSH CLI acceptance

This document belongs to **WEB-OFFICIAL-CLI-001 rev 1**.

The goal is to prepare and inspect the current `@penrix/dsh-chatgpt-web` candidate inside an isolated official DeepSeek Harness CLI `0.1.7-rc.2` headless-derived profile without sending any ChatGPT prompt. The real send is a separate explicit local phase.

## Preservation envelope

The harness must not:

- mutate the shipped `headless` profile;
- clear or invent the signed-in ChatGPT browser profile;
- clear durable send/rate state;
- retry a possibly-sent prompt;
- bypass the provider's existing 30-second spacing, 8-per-300-second page gate, 2/4/8/10-minute history cooldowns, `maxRetries=0`, pre-Send checks, post-Send pending lock, or strict tool/schema validation.

The script therefore uses a custom profile named `penrix-chatgpt-web-headless` by default. Its creation uses the official boot-free config-dump path from the shipped `headless` template. The project plugin is installed only into that custom profile.

## Phases

### Prepare

Offline with respect to ChatGPT:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\official-cli-acceptance.ps1 -Phase Prepare
```

Prepare:

1. requires `dsh --version` to be exactly `0.1.7-rc.2`;
2. reuses the isolated profile if it already exists, otherwise creates it with `--from-default-profile headless --dump-config`;
3. runs the repository build and packs the current package;
4. installs that local tarball into the isolated profile through `dsh plugin --profile ... add`;
5. immediately runs Inspect.

Running Prepare a second time reuses the same custom profile and reinstalls the current local tarball; it never recreates or replaces the shipped `headless` profile.

### Inspect

Also offline with respect to ChatGPT:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\official-cli-acceptance.ps1 -Phase Inspect
```

Inspect proves, without booting the headless app, that:

- the official CLI version is `0.1.7-rc.2`;
- `@penrix/dsh-chatgpt-web` is listed in the isolated profile;
- the composed config contains the plugin;
- the acceptance overlay selects provider `chatgpt-web`;
- the acceptance overlay selects model `chatgpt-web/high`.

If any prerequisite is missing, Inspect exits nonzero before any ChatGPT browser or Send can occur.

### Live

Live is intentionally separate. It requires the operator to provide the already-existing signed-in ChatGPT browser profile path; the script refuses to invent one.

Example shape:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\official-cli-acceptance.ps1 `
  -Phase Live `
  -ChatGptProfileDir '<EXISTING_SIGNED_IN_CHATGPT_PROFILE>' `
  -EvidencePath "$env:TEMP\dsh-official-cli-live.txt"
```

Before the one-shot headless invocation, Live reruns Inspect. It then composes an ephemeral overlay containing the explicit browser profile plus the `chatgpt-web/high` default route and invokes the official CLI exactly once.

There is no script retry loop. A nonzero result is recorded and returned as failure; any post-Send ambiguity remains owned by the provider's durable fail-closed state.

## Evidence classification

Web-side repository/static checks can establish **CODE VERIFIED, LIVE UNVERIFIED** only when the relevant tests/build checks actually run and pass.

The final user-facing claim **LIVE VERIFIED** requires the actual Windows machine, official CLI `0.1.7-rc.2`, the real signed-in browser profile, current durable rate state, and one successful `chatgpt-web/high` invocation. Historical `m1-live.json` evidence predating later production changes does not satisfy that claim for the current head.
