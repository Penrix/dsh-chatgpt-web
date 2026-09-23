# WEB-M2-WIN-LIVE-008 live acceptance

This packet owns M2 acceptance diagnostics only. It does not change the production reasoning parser.

## Verified baseline

- Integration tested before this packet: `web-win-live-001@f2ae9ac001babaa8e53a8fd6052812f0723514fd`.
- M2 source tested before this packet: `f4b1415d45b210a9d681b4092cf9ba2a0154d93f`.
- Rev 7 environment-scope fix is proven on real Windows: quiescence passed, `environment.restoredBeforeAdapter=true`, Chrome launched, and the request reached real ChatGPT Web.
- Rev 7 first blocker is now a reasoning-envelope parse failure at `seed-real-memory` after one provider request.
- No memory tool ran and M3 did not run.

## Missing evidence addressed by Rev 8

M2 previously constructed `ChatGptWebAdapter` without the existing `onReasoningEnvelopeError` diagnostic hook used by M1. The raw assistant reply was therefore lost after cleanup.

Rev 8 ports the same bounded diagnostic discipline into M2 acceptance:

- raw response length;
- SHA-256;
- whether trimmed text starts/ends with `{` / `}`;
- markdown fence marker count;
- bounded preview only: 1536-character head + truncation marker + 512-character tail, maximum raw payload exposure equivalent to 2048 characters;
- parser error summary.

The full raw response is never written to evidence.

## Implementation

`scripts/m2-reasoning-diagnostic.mjs` contains the bounded diagnostic helper.

`scripts/m2-live.mjs` wires `onReasoningEnvelopeError` into the existing `ChatGptWebAdapter` options and immediately stores only the bounded diagnostic at `evidence.reasoningEnvelopeDiagnostic`.

Rev 7 HOME/USERPROFILE scoping remains unchanged. Rev 6 profile quiescence remains as a bounded safety check.

No changes are made to:

- `src/reasoning-result.ts`;
- `src/chatgpt/**`;
- production prompt/parser behavior;
- M1 production code;
- M3 production code.

## Focused regression coverage

`tests/m2-reasoning-diagnostic.test.ts` proves:

- short responses keep complete bounded preview plus metadata;
- SHA-256 and brace/fence metadata are recorded;
- long responses are truncated to 1536 head + marker + 512 tail;
- the middle of a long raw response is not dumped;
- parser error summary is captured.

Existing Rev 7 environment-scope and Rev 6 quiescence tests remain in place.

## Evidence preservation

All prior files remain preserved:

```text
m2-live.json
m2-live-resume.json
m2-live-resume-rev7.json
```

Rev 8 writes:

```text
m2-live-resume-rev8.json
```

## Packaging

This packet changes scripts/tests/docs/integration orchestration only. No packed production bytes change.

**No Prepare, repack, Desktop reinstall, or DesktopReadback is required.**

## Exact Windows resume command

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\windows-live-all.ps1 `
  -Phase ResumeM2 `
  -EvidenceRoot 'C:\Users\123\AppData\Local\Temp\dsh-chatgpt-web-win-live-evidence-ff62ba6c'
```

The next Windows run is **diagnostic only**. It is intended to capture the bounded raw-reply evidence for the first real reasoning-envelope failure. No production parser fix is claimed by Rev 8.
