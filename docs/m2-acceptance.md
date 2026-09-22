# M2 browserless acceptance seam

Packet: `WEB-M2-003 rev 1` (bounded repair of `WEB-M2-002`)

This document narrows Milestone 2 to one browserless compatibility seam. It does **not** claim that Desktop installation, ChatGPT Web inference, compaction, reflection, dream, or live memory persistence has passed.

## Fixed baseline

- Parent candidate: `web-m1-001-rev2@653995ea6d7ae014c3498c42082f263acde90185`
- DSH package baseline: `0.1.5-rc.2`
- Cordis: `4.0.2`
- Schemastery: `3.18.2`
- Upstream repository: <https://github.com/Phant0Meow/dsh-meow-memory>
- Examined upstream source: `0405e1a8e46c36a5945697f948d88998c8de99f9`
- Package/plugin identity: `meow-memory@0.27.0`
- DSH rc.2 release source used for the tool-registry contract: `deepseek-ai/deepseek-harness@a30530342297e6006623a775166fee1d14fd413a`

Authoritative upstream evidence:

- package manifest: <https://github.com/Phant0Meow/dsh-meow-memory/blob/0405e1a8e46c36a5945697f948d88998c8de99f9/package.json>
- plugin identity/injection: <https://github.com/Phant0Meow/dsh-meow-memory/blob/0405e1a8e46c36a5945697f948d88998c8de99f9/src/index.ts>
- tool definitions: <https://github.com/Phant0Meow/dsh-meow-memory/blob/0405e1a8e46c36a5945697f948d88998c8de99f9/src/tools.ts>
- dream tool: <https://github.com/Phant0Meow/dsh-meow-memory/blob/0405e1a8e46c36a5945697f948d88998c8de99f9/src/dream.ts>
- DSH rc.2 tool registry: <https://github.com/deepseek-ai/deepseek-harness/blob/a30530342297e6006623a775166fee1d14fd413a/packages/core/tools/src/index.ts>

## What the contract test does

`tests/dsh-meow-memory.contract.test.ts` deliberately mounts only the upstream hard dependency:

```text
root Cordis Context
  -> real @deepseek-ai/dsh-system-prompt 0.1.5-rc.2 SystemPrompt
  -> real @deepseek-ai/dsh-tools 0.1.5-rc.2 ToolRuntime
  -> real installed meow-memory 0.27.0 plugin
  -> probe plugin with inject: ['tools']
  -> probe context reads ctx.tools.schemas()
```

The test does not copy meow-memory schemas into a fake plugin. It dynamically imports the installed package at runtime and checks:

1. package manifest name/version/repository;
2. plugin export `name === "meow-memory"`;
3. plugin hard injection contract `inject === ["tools"]`;
4. the exact seven `memory_*` tool names registered by this package version:
   - `memory_dream`
   - `memory_find_similar`
   - `memory_project`
   - `memory_read`
   - `memory_remember`
   - `memory_search`
   - `memory_update`
5. the five Issue #2 acceptance tools exist;
6. representative raw JSON-Schema facts are read from `ctx.tools.schemas()` inside a real Cordis probe plugin declaring `inject: ['tools']`, including required fields, `additionalProperties: false`, string/array/integer shapes, and the `memory_update.status` enum. The root `Context` never directly consumes the tools service.

The test temporarily redirects `HOME` and `USERPROFILE` to a throwaway directory before importing the plugin, so meow-memory's diagnostic/index side effects cannot write into the developer's real home directory. Reflection, automatic migration, and automatic dream are disabled because they are outside this packet.

## What this seam proves when executed successfully

A passing run proves only that the published `meow-memory@0.27.0` package can be resolved and loaded beside the exact rc.2 test graph, that the real rc.2 `SystemPrompt` → `ToolRuntime` service dependency chain is satisfiable, and that meow-memory's registered model-facing tool contract matches the package/version expected by Issue #2.

This is a sibling-plugin test dependency only. `@penrix/dsh-chatgpt-web` does not gain a runtime dependency on meow-memory and does not own memory storage or semantics.

## What remains local/live-only

The following remain **未验证** in this packet:

- DSH Desktop 2.0.13 plugin installation and supported profile mutation path;
- Desktop embedded Node and `node:sqlite` behavior;
- actual SQLite/session persistence paths on the user's machine;
- ChatGPT Web login/model/send/extract and real memory tool proposals;
- first-turn snapshot and keyword-hit provenance through the live provider;
- compaction reinjection;
- reflection;
- automatic dream and the known busy-turn collision;
- the full `docs/acceptance.md` steps 1-12.

Raw DSH/DVR history remains original evidence. meow-memory remains derived structured memory. No vector database, paid API, ChatGPT-native MCP, or provider-owned memory DB is introduced.

## Validation status for this packet

The repository is public and GitHub Actions is available; the old quota-exhaustion constraint no longer applies.

The bounded rev 3 repair was already exercised locally before commit with exactly these code changes:

```ts
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
...
await ctx.plugin(SystemPrompt)
await ctx.plugin(ToolRuntime)
```

Recorded local result from PR #12:

- plain install: **PASS**;
- typecheck: **PASS**;
- focused real-package contract test: **PASS**;
- full tests: **PASS** (7 files / 31 tests);
- build: **PASS**;
- `smoke:load`: **PASS**;
- `smoke:pack`: **PASS**.

The final committed repair preserves that exact test change. This execution environment could not independently rerun npm because its local shell cannot resolve external hosts. That limitation is environmental, not a repository failure.

GitHub Actions status for PR #12: **no run exists on the current head**. The repository workflow is enabled and has `workflow_dispatch`, but automatic `pull_request` runs are scoped to PRs targeting `main`; PR #12 correctly remains targeted at `web-m1-001-rev2`. No PR-base or workflow change was made merely to force CI because that would exceed this bounded repair.

Cordis 4.0.2 service behavior remains the governing contract: service consumers declare `inject`, and `ToolRuntime` itself requires `systemPrompt`; therefore the harness must mount real `SystemPrompt` before real `ToolRuntime`.

Remaining local/live-only risks are unchanged: Desktop 2.0.13 installation/runtime, embedded Node/`node:sqlite`, live persistence, ChatGPT Web inference and provenance, compaction reinjection, reflection, dream busy-turn behavior, and the full end-to-end acceptance scenario.
