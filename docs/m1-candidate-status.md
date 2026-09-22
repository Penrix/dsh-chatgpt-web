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
