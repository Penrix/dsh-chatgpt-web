# ChatGPT Web runtime reality audit

Date: 2026-09-30

This note records the implementation-level comparison used to decide what M1 should change and what it should leave alone.

## External implementations inspected

- `yudduy/chatgpt-pro-web`: persistent profile, headed default, pre-send assistant baseline, sustained Stop absence, long Pro timeout, Copy-first extraction.
- `guilhermesilveira/chatgpt-mcp`: persistent profile/CDP, serialized mutation, bound new assistant turn, no absolute response timeout for long thinking.
- `MrBalourd/chatgpt-api-web`: persistent Chrome/CDP identity, conversation mapping, response stabilization and generation-state checks.
- Playwright persistent-profile/auth-state contracts.

These are evidence sources, not templates to copy wholesale.

## Keep: current upstream Send/reply/completion boundary

Current `codex-chatgpt-web` already owns stable pre-Send turn identities, Send activation, semantic submission evidence, one bound new assistant `data-turn-id`, virtualization-safe rebinding, Stop/running-state completion, visible Copy action, text+HTML settling, in-flight-tool exclusion and a post-tool completion fence.

A failure after Send activation but before acceptance is outcome-unknown and nonretryable. DSH host retries remain disabled.

## Keep: DSH owns tools and Session

M1 intentionally does not use ChatGPT Native Connector/MCP as its tool executor. DSH serializes canonical history and tool schemas, validates one `action_proposal`, emits a native DSH tool call, executes it in ToolRuntime, records tool/call + tool/result, then sends the updated Session into the next Web inference.

## Keep for now: sanitized derived browser state

Many small projects run directly from one persistent profile. M1 instead keeps that profile as the durable legacy-login source and runs normal turns from sanitized `storage-state.json`. Windows regression already proves persistent and session-cookie restore, export, sanitize and fresh-context re-import; every Send still requires an authenticated Temporary Chat surface. The first owner-Desktop run is the right place to decide whether real auth needs state this derivation cannot carry.

## Removed: downstream limits that duplicated the transport

- `turnTimeoutMs=900000`: removed as a default; long Pro/deep-thinking turns can exceed 15 minutes.
- `composerMaxChars=180000`: removed as a default; upstream owns measured model/effort browser limits.
- `contextWindow=90000`: removed as a default; route-specific model capacity now reaches DSH unless the operator explicitly caps it.
- `maxTokens=16384`: removed as a default; the Web UI cannot enforce that provider output cap, so advertising it made DSH metadata false.

The explicit override fields remain available where useful. Upstream stage deadlines, DOM grace periods and post-Send ambiguity rules are unchanged.

## Deferred: browser-process crash self-healing

A managed worker caches its Chrome/context lifecycle. If owner-long-run evidence reproduces a browser disconnect, the narrow target is: current turn fails closed, then a later separate user turn may rebuild Chrome before any Send. A possibly-sent turn must never be replayed.

## Known semantic limitation: explicit maxTokens

DSH callers may supply an explicit `maxTokens`, including compaction summarization. ChatGPT Web has no native control enforcing the same cap. M1 no longer invents a default cap, but rejecting explicit caps wholesale would also break DSH compaction summarization, so this remains recorded rather than hidden.

## Current product proof still missing

Real official DSH Desktop → current exact plugin → real existing owner ChatGPT login reuse → plain Web inference → native DSH tool execution → post-tool Web continuation.

Until that runs on the owner's Windows machine, status remains **CODE VERIFIED, LIVE UNVERIFIED**.
