# WEB-M2-WIN-LIVE-005 live acceptance

This packet owns M2 only. It does not modify M1 browser/provider semantics or M3 WebCodex.

## Authoritative Windows state

- Product target: the user's own Windows machine.
- DSH Desktop: 2.0.13.
- Candidate plugin is already installed and enabled through Desktop's main-app sidebar Plugins / shared Web Plugin Manager.
- Accepted tarball SHA-256: `5e502457ae906697dc86cf988600619bccb6bd1f633f887f386b79bfaeb2b3b0`.
- DesktopReadback passed with the local candidate dependency and `bundleSelected=True`.
- Desktop restarted healthy and no reserved Desktop profile file was hand-edited.
- The dedicated ChatGPT provider profile does not exist yet. That is valid first-run state; M1 owns creating it and interactive sign-in.
- Missing WebCodex Server/Runner/base URL/credential/Project belongs to M3 and must not block M2.
- Live M1/M2/M3 product acceptance has not yet run.

## Provider profile continuity

M1 and M2 use the same default dedicated profile convention:

```text
~/.dsh-chatgpt-web-penrix/chrome-profile
```

M1's live runner uses `M1_PROFILE_DIR` to override that path. M2 uses `M2_CHATGPT_PROFILE` to override it. If neither override is supplied, both resolve to the same dedicated directory.

M2 computes the provider profile path before temporarily isolating `HOME` / `USERPROFILE` for meow-memory diagnostics, so the meow isolation does not redirect the ChatGPT browser profile.

After M1 has created/signed into the profile, M2 reuses the same profile. It does not borrow the user's ordinary Chrome profile.

## No persistent ChatGPT conversation

DSH Session is the canonical conversation owner.

The ChatGPT Web provider opens a fresh page for each inference and `runFreshTurn()` explicitly navigates that page to Temporary Chat before Send. The page is closed after the inference. M2 therefore does not require or reuse a persistent ChatGPT Web thread.

The M2 proof intentionally keeps one canonical DSH Session across later Web inferences while provider pages remain fresh.

## Truth surfaces

Evidence stays separated between:

1. **DSH Session** — `turn/*`, `user/message`, `assistant/message`, `tool/call`, `tool/result`, `compaction/*`.
2. **meow-memory** — SQLite persistence plus plugin messages whose source is `{ kind: "plugin", plugin: "meow-memory" }`.
3. **Provider** — actually observed `llm/stream` requests handed unchanged to the real ChatGPT Web adapter.
4. **Derived acceptance assertions** — pass/fail conclusions calculated from the first three.

No legacy `M2_LIVE_COMPOSITE_*` value is used as current integration truth.

## Required live sequence

The real run must prove:

```text
same canonical DSH Session
→ first-turn meow snapshot is plugin/context, while genuine human input remains the target
→ memory_search / memory_project / memory_read / memory_remember / memory_update
→ each tool/call has a tool/result in the same Session
→ that tool result is present before the next real Web inference
→ durable remember/update in meow SQLite
→ later inference through another fresh Temporary Chat page with the same DSH Session
→ remembered fact retrieved again
→ real DSH compaction
→ successful compaction/end
→ next genuine user turn receives meow snapshot meta kind=reinjection
→ real meow reflection
→ automatic dream/busy-turn edge observed and recorded truthfully
```

A stage remains `running` until all assertions for that stage pass. If an assertion or runtime step fails, that stage becomes `failed`, the first blocker is recorded, and later stages are never created or reported as passes.

## Current integration-head execution

The old PR #10/#11 reconstruction is obsolete for Windows execution.

`scripts/m2-live-composite.ps1` now:

1. fetches the current `web-win-live-001` head;
2. creates a detached temporary worktree at that actual integration head;
3. overlays only the current M2-owned live runner/doc from `web-m2-live-004`;
4. verifies the integration package still contains `m2:live` and `meow-memory@0.27.0`;
5. removes any stale `M2_LIVE_COMPOSITE_*` environment variables;
6. records the actual integration ref/head, actual M2 source head and overlay paths;
7. optionally runs install/typecheck/tests/build/load/pack;
8. launches the real M2 live runner.

A newer integration head is accepted by default and recorded truthfully. `-ExpectedIntegrationHead` is optional and should be used only when the operator intentionally wants an exact-head guard.

No `src/chatgpt/**` or `src/webcodex/**` file is modified by this M2 overlay.

## Exact next Windows command

After M1 has created the dedicated provider profile and completed interactive ChatGPT sign-in:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\m2-live-composite.ps1 -IntegrationRef web-win-live-001
```

Optional explicit evidence destination:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\m2-live-composite.ps1 -IntegrationRef web-win-live-001 -EvidencePath "$env:TEMP\m2-win-live.json"
```

No WebCodex environment variable is required.

## Current execution status

The Windows/browser live sequence is still **未执行** in this ChatGPT window. This source audit and M2 repair do not count as product live evidence.

The first real product blocker, if any, must come from the Windows evidence JSON. An M1/browser/provider blocker must be reported to M1 rather than repaired on this branch.
