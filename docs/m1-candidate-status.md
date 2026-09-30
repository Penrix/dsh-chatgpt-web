# M1 candidate status — Desktop-first ChatGPT Web

> **Current-state entrypoint — 2026-09-30**
>
> Exact DSH revision authority is the current head of Draft PR #18 on
> `m1a-relay-spike`. Do not recover an exact DSH head from historical sections
> below; a document cannot reliably embed its own commit SHA.
>
> Current pinned upstream transport:
> `Penrix/codex-chatgpt-web@c2e0b9df805a7978c2abf983750c56e721b0c86e`.
>
> Current evidence class: **CODE VERIFIED, LIVE UNVERIFIED**.
>
> Current downstream validation authority is the latest `M1 candidate validation`
> check attached to the current Draft PR #18 head. Do not treat a historical
> run id embedded lower in this document as current evidence.
>
> Current upstream Windows pre-audit evidence: run `36536878891` —
> browser-login regression **PASS** (including persistent + session-cookie restore,
> storage export/sanitize/re-import) and managed-Chrome storage-state privacy
> regression **PASS**. The workflow fails later at the already-known repository-wide
> dependency `bun audit` gate.
>
> Live packets rev 1 through rev 5 are retired. No replacement live packet has
> been issued. The next product proof is Desktop-first: exact candidate install
> → Desktop model discovery → one plain Web inference → Desktop tool loop.
>
> Independent CodeRabbit diff review is **UNRESOLVED** because the available
> terminal environment could not resolve `github.com`; no manual review is
> represented as CodeRabbit output.

Current owning Draft PR: #18  
Primary transport architecture: ADR-0006  
Primary product-acceptance architecture: ADR-0007  
Upstream reusable transport Draft PR: `Penrix/codex-chatgpt-web#10`

## Current M1 shape

The primary provider path does not require the Codex Web GPT desktop Launcher
or localhost Responses relay. ADR-0007 now requires the real DeepSeek Harness
Desktop to be the product entrypoint for M1 acceptance:

```text
DSH Session / AgentLoop
→ @penrix/dsh-chatgpt-web
→ embedded codex-chatgpt-web managed-Chrome transport
→ ChatGPT Web
```

Current ownership:

- DSH owns canonical Session/history and tool execution.
- `dsh-chatgpt-web` owns prompt compilation and final/action parsing.
- the embedded upstream transport owns ChatGPT-specific browser lifecycle,
  model/effort selection, submission evidence, reply binding/completion and
  post-Send ambiguity.
- persistent DSH Chrome profiles are durable legacy-login sources;
  `storage-state.json` is a derived/rebuildable cache.
- both legacy-profile migration and managed-turn cache refresh use the same
  ChatGPT/OpenAI storage-state sanitizer.
- first-party partitioned cookies are retained only when both the cookie host
  and HTTPS partition-key host remain within the ChatGPT/OpenAI allowlist;
  cross-site identity-provider partition state remains excluded.
- the browser transport is lazy; no Codex Web GPT desktop process needs to
  remain resident.
- the upstream transport is pinned at the exact Git revision shown in the
  current-state block and bundled into `lib`; the final plugin does not require
  the Git package at runtime.
- stale derived login markers cannot authorize a Send by themselves:
  browser-worker re-proves an authenticated Temporary Chat surface before
  `onSendActivated`.
- real ChatGPT Web round-trip acceptance for the current code is still
  **LIVE UNVERIFIED**.
- DSH-side `turnTimeoutMs`, `composerMaxChars`, `contextWindow`, and `maxTokens` are operator-only overrides; normal operation no longer invents fixed defaults ahead of upstream/model-specific limits.

Current verification scope:

- upstream Windows uses real Google Chrome to reopen an independently persisted
  credential-free profile through the same normal-Chrome/CDP migration boundary,
  export `BrowserContext.storageState()`, sanitize it, and re-import the
  sanitized state into a fresh Chrome context;
- a separate regression proves managed-Chrome turn completion cannot write raw
  browser state back over the sanitized derived cache;
- downstream validates install, typecheck, unit tests, live-harness syntax,
  build, bundle/load, pack inventory and a fresh production-only install/import.
- the fresh production consumer's actual npm dependency tree is checked to
  exclude the upstream-only audited packages `@modelcontextprotocol/sdk`,
  `hono`, `fast-uri` and `ip-address`.

Current explicit deferrals / non-blockers:

- the historical CLI-only `loginToChatGpt()` raw state write is outside the DSH
  embedded M1 path and has not been broadened into this repair;
- a verified-marker file can outlive remote authentication, but the real
  browser surface is checked again before Send; no second auth state machine is
  added without an observed failure;
- the repository has no package lock and therefore dependency reproducibility is
  weaker than an immutable lockfile; this is pre-existing and not expanded into
  the M1 auth fix without evidence;
- upstream repo-wide dependency advisories remain real maintenance work but are
  distinct from the browser-login regressions that execute before the audit gate.
- managed Chrome next-turn self-healing after an unexpected browser-process disconnect remains deferred until owner-machine evidence justifies it; current turns fail closed and are never automatically resent.
- explicit caller `maxTokens` is not natively enforceable by ChatGPT Web; the false 16,384 adapter default is gone, but caller-supplied caps remain a recorded semantic limitation.
- sanitized derived `storage-state.json` remains intentional until owner-live evidence shows real account auth needs state it cannot carry.

The historical candidate record below is retained only as formation history.
Any section below that calls itself “current” is current only for that historical
work unit and must not override this entrypoint.

---

## Historical candidate record

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


## Rev 3 Windows blocker follow-up

Windows rev 3 established that the embedded path stays independent of Codex Web GPT Desktop/Launcher, but both existing DSH Chrome profiles failed authentication verification before model Send.

The upstream transport now adopts legacy persistent profiles by starting the existing profile in ordinary Chrome with a bounded loopback CDP endpoint, then attaching Playwright after Chrome owns profile/session restoration. This replaces direct `launchPersistentContext(profileDir)` for the migration path only.

The fail-closed contract is unchanged:

- existing profile reuse must verify automatically;
- interactive sign-in remains forbidden during M1 acceptance;
- no model Send occurs if reuse cannot be proven;
- derived storage state remains sanitized to ChatGPT/OpenAI scope.

Current pinned upstream repair: `c2e0b9df805a7978c2abf983750c56e721b0c86e`.

Evidence remains **CODE VERIFIED, LIVE UNVERIFIED** until fresh downstream CI passes and a later exact Windows acceptance succeeds.


## Self-audit verification follow-up

The first rev-4 packet was retired before owner-machine execution because the new legacy-profile CDP behavior had not actually run in a relevant regression test.

Upstream head `c2e0b9df805a7978c2abf983750c56e721b0c86e` now includes a Windows CI regression smoke that uses real Google Chrome with a temporary custom user-data-dir and proves:

```text
normal Chrome
→ --remote-debugging-port=0
→ profile-local DevToolsActivePort
→ Playwright connectOverCDP(127.0.0.1)
→ live page operation
→ controlled cleanup
```

No ChatGPT credentials, login, or model Send are used by that CI smoke.

The production adoption path also now refuses to mark a migrated profile verified when sanitized state contains zero reusable ChatGPT/OpenAI cookies.

A fresh downstream exact-head validation is required after this pin before another owner-machine live packet.


## Second self-audit: first-party partitioned-cookie blocker

Rev 5 was retired before owner-machine execution.

A stronger Windows regression reproduced a materially closer form of the rev-3 blocker:

```text
persistent Chrome profile already contains a ChatGPT-domain cookie
→ normal Chrome + loopback CDP reopens the same profile
→ context.cookies() sees the cookie
→ storageState() exports it
→ previous sanitizer removes it
```

Chrome 152 / current Playwright can represent a first-party ChatGPT cookie with a `partitionKey`. The previous sanitizer rejected every cookie carrying any partition key, including a key whose top-level site is itself within the approved ChatGPT/OpenAI boundary.

Pinned upstream `c2e0b9df805a7978c2abf983750c56e721b0c86e` now preserves:

- unpartitioned cookies on approved ChatGPT/OpenAI hosts;
- partitioned cookies only when the partition key is also an HTTPS ChatGPT/OpenAI host.

It still rejects identity-provider / third-party partition keys such as `https://accounts.google.com`.

Fresh upstream Windows pre-audit regression run `36534320958` passed all six `browser-login.test.ts` cases, including a real Chrome persistent-profile/CDP cookie round-trip and the sanitizer boundary.

The repository-wide upstream workflow still fails later at the pre-existing dependency `bun audit` advisories.

A fresh downstream exact-pin validation is required before another owner-machine live packet.


## Third self-audit: managed-turn auth-cache persistence

A further ownership audit found a second write path to the same derived login cache:

```text
legacy-profile migration
→ sanitized storageState
→ storage-state.json

managed browser turn completion
→ raw context.storageState()
→ same storage-state.json
```

The second path bypassed the sanitizer and could silently widen or corrupt the privacy boundary after the first successful model turn.

Upstream head `c2e0b9df805a7978c2abf983750c56e721b0c86e` now applies the existing `sanitizeBrowserLoginStorageState()` policy before every managed-Chrome turn writes the derived cache.

TDD evidence:

- red upstream run `36535642757`: the dedicated privacy-boundary regression failed because browser-worker wrote raw `context.storageState()`;
- green upstream run `36536878891`: Windows browser-login regression PASS and managed-Chrome storage-state privacy regression PASS before the known repository-wide `bun audit` gate.

The Windows browser-login regression also proves sanitized derived state can be imported into a fresh Chrome context and restores the credential-free ChatGPT-domain test cookie.

The old CLI-only `loginToChatGpt()` raw write remains historical/outside the DSH embedded M1 path and is not changed by this repair.

A fresh downstream exact-pin validation is required before another live packet.
