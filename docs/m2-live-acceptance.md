# WEB-M2-WIN-LIVE-006 live acceptance

This packet owns M2 only. M1 real E2E has already passed on Windows integration head `ff62ba6caa3934da5dfbf52693f594951b0d3fb7` and must not be rerun unless M1 production behavior changes.

## Verified Windows baseline

- DSH Desktop 2.0.13.
- Node 24.16.0 / npm 11.13.0 / PowerShell 7.6.3.
- Latest Prepare passed install, typecheck, 9 test files / 54 tests, build, smoke:load and smoke:pack.
- The candidate package is installed in the active Desktop profile and DesktopReadback passed.
- WebCodex local service, runner and exact project are online.
- M1 real ChatGPT Web → DSH echo → second real inference passed on `ff62ba6c...`.
- M2 then failed at `seed-real-memory` before any memory tool or persistence assertion.

## First real M2 blocker

The failed M2 request reused the same dedicated profile that M1 had just used successfully:

```text
C:\Users\123\.dsh-chatgpt-web-penrix\chrome-profile
```

The second `browserType.launchPersistentContext` timed out after 180000 ms. Chrome stderr said remote debugging requires a non-default data directory even though the launch command already contained the dedicated `--user-data-dir=...` and `--remote-debugging-pipe`.

Source audit establishes:

1. M1 awaits `adapter.dispose()`.
2. `ChatGptWebAdapter.dispose()` awaits `ChatGptBrowser.close()`.
3. `ChatGptBrowser.close()` awaits `context.close()`, but deliberately swallows a close rejection.
4. The integration runner waits for the M1 Node child process to exit, then immediately launches M2 against the identical persistent profile.
5. There was no OS-level proof that the previous Chrome profile owner/process had fully disappeared before the second persistent launch.

The Windows evidence does **not** prove whether the remaining owner window came from slow Chrome/Windows process reaping after a successful close or from a close failure hidden by best-effort disposal. The concrete defect is the same in either case: the sequential M1 → M2 path crossed the same-profile launch boundary without a quiescence check.

## Narrow M2-owned fix

The fix does not change M1 parser, protocol, send safety, browser launch flags, profile path, cookies or login state.

`scripts/m2-profile-quiescence.mjs` performs a bounded, read-only Windows process check:

- inspects only `chrome.exe` / `msedge.exe`;
- matches only a process whose command line contains the exact dedicated `--user-data-dir`;
- waits until no matching process remains;
- never kills a process;
- never deletes `Singleton*` files;
- never changes or clones the profile;
- times out fail-closed with only process name/PID evidence.

Focused regression coverage exercises:

- occupied → occupied → released: barrier succeeds only after release;
- continuously occupied: barrier exits blocked with `M2_PROFILE_BUSY` and does not mutate anything.

The standalone M2 launcher and the Windows integration runner both execute this barrier before M2 opens the persistent profile.

## Existing M1 PASS is preserved

Draft PR #17 adds `ResumeM2`.

`ResumeM2`:

1. requires the existing `m1-live.json`;
2. requires `accepted=true`;
3. requires its recorded `profileDir` to equal the current dedicated profile;
4. does **not** execute M1;
5. runs the quiescence barrier;
6. runs M2 and writes new M2 resume evidence;
7. only on M2 success proceeds directly to the existing M3 prerequisite check and M3 live seam;
8. stops on the first failure.

The original failed `m2-live.json` is preserved; resumed evidence is written separately as `m2-live-resume.json`.

## Production package / reinstall

This repair changes acceptance scripts, tests and documentation only. It does not change `src/**`, `package.json`, the packed runtime bundle, M1 production behavior or M3 production behavior.

Therefore the already-installed production candidate remains byte-identical for this repair:

**Prepare / repack / Desktop reinstall / DesktopReadback are not required before ResumeM2.**

## Exact Windows resume command

Use the evidence root that already contains the passed M1 evidence:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\windows-live-all.ps1 `
  -Phase ResumeM2 `
  -EvidenceRoot 'C:\Users\123\AppData\Local\Temp\dsh-chatgpt-web-win-live-evidence-ff62ba6c'
```

No M1 rerun occurs.

Expected order:

```text
existing M1 accepted evidence
→ dedicated profile quiescence
→ M2 real meow-memory E2E
→ if M2 PASS, M3 prerequisite check
→ M3 real read-only seam
```

If the barrier itself times out, that is the next concrete Windows blocker and its process/PID evidence should be delivered without extra diagnostics.

## M2 proof contract after browser handoff

Once the provider opens successfully, M2 still requires:

```text
same canonical DSH Session
→ first-turn meow snapshot as plugin/context, not human intent
→ memory_search/project/read/remember/update through normal DSH tool loop
→ each tool result enters the same Session before next real Web inference
→ durable remember/update
→ fresh Temporary Chat page while same DSH Session continues
→ retrieve remembered fact again
→ DSH compaction
→ reinjection on next genuine user turn
→ reflection
→ automatic-dream/busy-turn edge observed truthfully
```

A failed stage remains failed and later stages are not represented as passes.
