# WEB-M2-WIN-LIVE-009 live acceptance

This packet fixes an M2 acceptance-harness scheduling bug only. It does not change the production ChatGPT Web provider, schema, prompt, or parser.

## Verified Windows starting point

- Integration actually tested before this packet: `web-win-live-001@08cf425e6463373d67a36648fdb08bae75a5f7f5`.
- Complete Prepare passed there: install, typecheck, 12 test files / 72 tests, build, smoke:load, smoke:pack.
- Production numeric-bound compatibility is installed and its built `lib/index.js` matched the installed Desktop bundle.
- M1 PASS remains preserved and was not rerun.
- Current live evidence: `m2-live-resume-after-m1-012.json`.
- Earlier network/effort pre-Send failures remain preserved separately.

## Exact observed scheduling interference

The ordinary M2 context previously mounted meow-memory with automatic dream enabled from the beginning:

```text
dream.enabled = true
dream.idleMinutes = 1
dream.checkMinutes = 1
suppressWindows = []
```

That allowed the already-idle seed session to fire `[meow-memory-dream]` while the main session was still completing ordinary memory-tool stages.

Observed global order:

1. main `memory_project` first inference;
2. seed-session automatic dream inference;
3. main `memory_project` post-tool continuation.

`memory_project` itself had already executed successfully with a non-error tool result before the provider/browser interference.

The successful result text is retained exactly as evidence:

`[project: m2-live-377097db-34d4-46ba-b284-64de6a7558df] No memory entries for this project yet.`

This packet does not reinterpret that result. Once the scheduling race is removed, existing assertions decide whether any semantic blocker remains.

## Rev 9 scheduling boundary

The ordinary acceptance context now mounts meow-memory with:

```text
dream.enabled = false
```

It also has an explicit fail-closed provider guard. Any `[meow-memory-dream]` request before the dedicated final dream stage raises `M2_EARLY_DREAM`.

After every ordinary memory, compaction, reinjection, and reflection stage completes, the harness:

1. begins `automatic-dream-busy-turn-dogfood`;
2. disposes the ordinary DSH context/provider so there is no same-profile provider race;
3. creates a separate dream-only DSH context;
4. mounts the same meow-memory 0.27.0 with real automatic dream enabled (`idleMinutes=1`, `checkMinutes=1`);
5. creates one dedicated dream agent;
6. arms the explicit dream gate for that agent only;
7. runs one ordinary seed turn and lets that agent become genuinely idle;
8. waits for the real scheduler-generated `[meow-memory-dream]` provider request;
9. queues the existing busy-turn collision prompt only for that target dream agent and only once.

The test is still automatic. It does not call `memory_dream`, and dream is not disabled forever.

## Focused gate coverage

`scripts/m2-dream-gate.mjs` owns the explicit arming state.

`tests/m2-dream-gate.test.ts` proves:

- an early dream is rejected while unarmed even when the simulated ordinary-stage elapsed time is 120 seconds, longer than the one-minute threshold;
- after arming, a real dream request is permitted only for the selected dream session;
- a wrong-session dream fails closed;
- the busy-turn collision decision returns true only once for the selected dream session;
- duplicate, wrong-agent, and non-dream requests cannot queue another collision.

Existing environment-scope, profile-quiescence, and bounded reasoning diagnostics are preserved.

## Ordinary stage semantics

The existing ordinary stages and assertions are unchanged. The change only prevents automatic dream scheduling from racing them.

## Evidence preservation

All existing evidence files remain preserved, including:

```text
m2-live.json
m2-live-resume.json
m2-live-resume-rev7.json
m2-live-resume-rev8.json
m2-live-resume-after-m1-012.json
m2-live-resume-after-m1-012-network-failure.json
m2-live-resume-after-m1-012-effort-timeout.json
```

The next integration run writes:

```text
m2-live-resume-after-m1-013.json
```

## Packaging

Rev 9 changes only scripts/tests/docs plus integration orchestration metadata.

No production provider/schema/parser source is changed, and no packed production bytes change.

**Prepare, repack, and Desktop reinstall are not required. Pull the synchronized integration head and run `ResumeM2` only.**

## Exact Windows resume command

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\windows-live-all.ps1 `
  -Phase ResumeM2 `
  -EvidenceRoot 'C:\Users\123\AppData\Local\Temp\dsh-chatgpt-web-win-live-evidence-ff62ba6c'
```

Remote work does not claim a new Windows live PASS. The next local run must determine the next real blocker after removing the dream scheduling race.
