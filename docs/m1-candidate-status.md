# M1 candidate status — WEB-M1-001 rev 2

Packet: `WEB-M1-001 rev 2`  
Base: `main` at `149c9424b278c58e0109f033074eb5d285131b05`  
Integration branch: `web-m1-001-rev2`

## What was intentionally brought forward

The old `phase-1-fresh-inference` branch diverged from current main (ahead 32 / behind 14). This candidate does not merge or force-update that branch.

Instead, a new branch was created from current main and only the M1 implementation files were brought forward:

- provider/adapter and ChatGPT browser transport;
- strict `final | action_proposal` protocol;
- exact DSH 0.1.5-rc.2 tool-schema validation;
- native DSH tool-call chunks;
- focused unit tests and a keyless DSH AgentLoop integration test;
- package/build/bundle metadata and browserless real-LlmRuntime load smoke.

Current main governance, ADRs, roadmap, acceptance contract, and meow-memory architecture remain the base.

## Candidate packaging

- Runtime entrypoint: `lib/index.js`.
- Type entrypoint: `lib/index.d.ts`.
- Build owner: `tsdown.config.ts`, single `src/index.ts` entry, ESM + DTS, output `lib/`.
- DSH bundle patch is shipped as `cordis.patch.yml`.
- Pack allowlist is `lib`, bundle patch, README, licenses/notices, package manifest.
- Source/tests are not part of the candidate pack.
- DSH/Cordis/Schemastery development baseline matches the verified local target rather than the earlier alpha baseline.

## Repository-native validation entrypoints

```text
npm install --no-audit --no-fund
npm run typecheck
npm test
npm run build
npm run smoke:load
npm run smoke:pack
```

`smoke:load` is keyless and browserless. `smoke:pack` validates the package inventory after build.

GitHub Actions workflow: `.github/workflows/m1-candidate.yml`.

## Validation truth

Observed GitHub Actions evidence:

- PR #5 triggered `M1 candidate validation`.
- Run #1 (`35699188531`) and later runs, including run #4 (`35699678217`), concluded `failure` **before any workflow step executed**.
- The Actions API reports the `validate` job with `steps: null` and no job log URL/content. Therefore dependency installation, typecheck, unit tests, build, load smoke, and pack smoke are **blocked/unrun**, not code failures and not passes.
- Per the task contract, no blind rerun is being used as evidence without a new cause/fix.

Static contract evidence completed in the candidate:

- branch was created from current main rather than force-updating the divergent experiment branch;
- DSH `0.1.5-rc.2` public APIs were checked for `ToolSchema`, native `tool-call` chunks, JSON-Schema validation, and agent-loop tool/result continuation;
- a keyless DSH AgentLoop integration test was added to exercise our native chunks through ToolRuntime into a second inference;
- `smoke:load` now mounts the built provider into a real DSH `LlmRuntime` without invoking `stream()` or launching a browser;
- post-Send safety was tightened so the outcome-unknown boundary starts before the browser click promise is awaited.

Do not interpret these static checks as install/build/runtime success. The executable checks remain unrun until a runner/local environment actually starts them.

## Reserved for local/Codex

- DSH Desktop bundle load under the real Desktop runtime;
- headed ChatGPT Web login/model selection/send/extract;
- harmless DSH tool → result → second inference → final;
- ambiguous post-Send reconciliation.

See `docs/windows-m1-acceptance.md` for the isolated and real-Desktop paths.


---

## WEB-M1-LOCAL-002 rev 1 — local staging/install handoff

Starting head for this packet: `e8d344846eb4136f6b71a502362b02438aa53f27`.

### Added local operator entrypoint

`scripts/m1-local.ps1` now owns the repeatable Windows handoff:

- `Stage` — default path; validates exact Git branch/optional head, clean checkout and package shape, runs repository checks unless explicitly skipped, packs the candidate, validates required packed artifacts, records SHA-256 and captures a read-only Desktop-profile metadata snapshot.
- `VerifyStage` — re-validates staged candidate ownership and SHA-256 without mutation.
- `InstallIsolated` — optional install into an owned TEMP `DSH_HOME`; supports `-WhatIf`; refuses the live home and non-TEMP targets.
- `RollbackIsolated` — deletes only an isolated home carrying this tool's ownership marker and supports `-WhatIf`.
- `DesktopInstallPlan` — read-only Desktop preflight: validates the staged SHA, resolves the parameterized Desktop root, requires Desktop version `2.0.13`, snapshots live profile metadata, and emits the exact tarball path + rollback/readback plan. It never writes the reserved `desktop` profile.
- `DesktopReadback` — read-only dependency/bundle-selection readback after Codex uses the official Desktop Plugins page.
- `DesktopRollbackPlan` — read-only rollback instructions/state report. Actual normal rollback remains owned by the Desktop Plugins page; fatal rollback uses Desktop native recovery.

Machine-specific paths are parameters or environment-derived defaults. No username is hard-coded.

### Desktop mutation boundary

The script intentionally does **not** install directly into `$DSH_HOME/profiles/desktop`.

The real Desktop mutation path remains:

```text
staged tarball
→ DesktopInstallPlan validates target + backup/readback evidence
→ Codex uses DSH Desktop → Plugins → Add plugin
→ Desktop plugin_manager owns package/profile mutation
→ DesktopReadback verifies saved state
```

This preserves DSH Desktop's profile lock/package-manager ownership and avoids hand-editing the installed app or reserved profile.

### Static/Web-verifiable acceptance

Verified by repository inspection only:

- default path stages/builds/packages before any Desktop mutation path is offered;
- staged artifacts are bound to package name + exact tarball SHA-256;
- source staging can be bound to an exact Git head with `-ExpectedHead`; detached worktrees are accepted only with an explicit exact head;
- replacing a staging directory requires this tool's existing stage marker and matching package owner;
- isolated installation refuses the live DSH home and refuses non-TEMP targets;
- isolated rollback requires the tool-owned marker;
- Desktop plan validates `DSH Desktop.exe` and expected Desktop version before Codex is told to install;
- Desktop profile backup/readback is copy/read-only; documentation explicitly forbids copying those files back into the live profile;
- actual Desktop mutation is delegated to the supported Plugins page/plugin manager, not direct filesystem writes;
- package outputs used by the script match the candidate manifest: `lib/index.js`, `lib/index.d.ts`, `cordis.patch.yml`, npm tarball;
- all commits pushed for this packet include `[skip ci]`;
- every commit pushed for this packet carries `[skip ci]`; no GitHub Actions workflow was intentionally triggered, rerun or waited on, and Actions are not used as delivery evidence.

### Unverified / reserved for Codex local execution

The following remain **unverified** until Codex runs them on the user's Windows machine:

- PowerShell parser/runtime execution of `scripts/m1-local.ps1`;
- `npm install`, typecheck, tests, build, load smoke, pack smoke;
- staging tarball creation/extraction on Windows;
- isolated `dsh plugin --profile web add` and rollback;
- DSH Desktop version readback on the installed machine;
- Desktop Plugins-page installation/load;
- real ChatGPT Web login/model selection/send/extract;
- harmless DSH tool → tool result → second inference → final;
- ambiguous post-Send recovery behavior in the installed runtime.

Do not convert any of these items into pass/fail claims without actual local execution.
