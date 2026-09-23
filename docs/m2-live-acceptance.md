# WEB-M2-WIN-LIVE-007 live acceptance

This packet owns M2 acceptance only. M1 real E2E remains preserved and must not be rerun.

## Verified Windows baseline

- Integration checkout tested before this repair: `web-win-live-001@5cf385c11a1f0f993d86f1bc605cb79750222cb4`.
- M2 source head tested before this repair: `8b69da5d952fc0e66250bc2ad0571398ae696d0d`.
- Existing M1 PASS evidence remains: `C:\Users\123\AppData\Local\Temp\dsh-chatgpt-web-win-live-evidence-ff62ba6c\m1-live.json`.
- Rev 6 M2 evidence remains preserved at `m2-live-resume.json`.
- Rev 6 quiescence barrier passed with no matching Chrome/Edge profile owner, yet M2 still failed at `seed-real-memory` before any memory tool ran.
- M3 did not run.

## Proven root cause

Rev 6's profile-quiescence hypothesis was disproven as the sufficient cause.

`scripts/m2-live.mjs` changed process-wide `HOME` and `USERPROFILE` to the fake meow test home before dynamically importing `meow-memory`, then kept those fake values in place through ChatGPT adapter construction and Chrome/Playwright startup.

The bounded Windows A/B reproduction proved:

1. normal `HOME/USERPROFILE` + fresh custom `userDataDir` -> launch PASS;
2. only changing `HOME` and `USERPROFILE` to a fresh fake home before launch -> FAIL with the same Chrome 152 remote-debugging default-data-dir rejection;
3. a fresh profile under the normal Penrix dedicated-profile parent path passes under the normal environment.

Therefore the actual defect is **M2 harness environment leakage into Chrome/Playwright startup**. The dedicated profile path itself is valid, and an occupied profile is not the proven cause.

Chromium's current remote-debugging check fails closed when it cannot determine the default data directory. The fake `HOME/USERPROFILE` changes that determination boundary on Windows.

## Narrow M2-only fix

`scripts/m2-home-scope.mjs` provides a small environment-scope primitive:

- snapshot original `HOME` / `USERPROFILE`;
- set both to the temporary meow home only while the supplied operation runs;
- restore both in `finally`, preserving originally-undefined variables exactly.

`scripts/m2-live.mjs` now uses that scope only for the dynamic `import('meow-memory')` boundary. This preserves meow-memory 0.27.0 import-captured homedir paths while avoiding fake-home leakage into the browser.

The project database remains independently isolated by the explicit workspace-relative `projectDir`.

Before creating the ChatGPT adapter, the live harness now explicitly asserts that `HOME/USERPROFILE` equal their original values and records `restoredBeforeAdapter: true` in evidence.

The outer live-run `finally` retains a defensive restoration on every exit.

## Rev 6 quiescence barrier status

The bounded profile-quiescence barrier remains as a safety check, but it is no longer described as the proven root-cause fix.

It still:

- observes only Chrome/Edge using the exact dedicated `--user-data-dir`;
- never kills a process;
- never deletes lock files;
- never changes profiles;
- fails closed on timeout.

## Focused regression coverage

`tests/m2-home-scope.test.ts` proves:

- temporary fake home is visible inside the meow import/bootstrap scope;
- original environment is restored before later adapter/browser-style use;
- restoration occurs when the import/bootstrap operation throws;
- undefined HOME/USERPROFILE values are restored exactly.

`tests/m2-profile-quiescence.test.ts` remains unchanged and continues to cover the rev 6 safety barrier truthfully.

## Packaging

This repair remains scripts/tests/docs only. It does not modify `src/**`, `package.json`, M1 production code, or M3 production code.

Therefore no Prepare, repack, Desktop reinstall, or DesktopReadback is required before ResumeM2.

## ResumeM2

ResumeM2 must preserve the existing M1 PASS and must not rerun M1.

The rev 6 failure file remains preserved. Rev 7 writes a new M2 evidence file:

```text
m2-live-resume-rev7.json
```

Expected order:

```text
existing M1 PASS evidence
-> bounded profile quiescence safety check
-> M2 with original HOME/USERPROFILE restored before browser startup
-> on M2 PASS, existing M3 prerequisite check
-> M3 real read-only seam
```

Stop at the first new real blocker and do not run extra diagnostics merely for curiosity.

## Exact Windows resume command

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\windows-live-all.ps1 `
  -Phase ResumeM2 `
  -EvidenceRoot 'C:\Users\123\AppData\Local\Temp\dsh-chatgpt-web-win-live-evidence-ff62ba6c'
```

Real Windows M2/M3 acceptance remains local-only and is not claimed by this remote repair.
