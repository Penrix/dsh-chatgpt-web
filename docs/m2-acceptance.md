# M2 browserless acceptance seam

Packet: `WEB-M2-002 rev 1`

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

A passing run proves only that the published `meow-memory@0.27.0` package can be resolved and loaded beside the exact rc.2 test graph, that its hard Cordis dependency is satisfiable by the real rc.2 `ToolRuntime`, and that its registered model-facing tool contract matches the package/version expected by Issue #2.

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

GitHub Actions quota is exhausted by explicit project constraint, so no workflow was triggered, rerun, waited on, or used as evidence.

Rev 2 also follows Cordis 4.0.2's service contract: `ctx.plugin()` returns an awaitable Fiber, while service consumers declare `inject`; the injected plugin context is where the required service is guaranteed ready. Source: `deepseek-ai/deepseek-harness@6af96785b528463b6ba9e7d1184658a0218fea8e`, `vendor/cordis/src/registry.ts` and `docs/cordis-tutorial/03-services.md`.

Therefore these commands are **未验证** until run in an allowed local environment:

```text
npm install --no-audit --no-fund
npm run typecheck
npm test
npm run build
npm run smoke:load
npm run smoke:pack
```

The next allowed local action is to run the plain install first. If resolution fails, preserve the exact npm error and stop rather than using `--force`, `--legacy-peer-deps`, overrides, mocks, or a copied schema. If install succeeds, run the focused meow-memory contract test and then the existing M1 checks.
