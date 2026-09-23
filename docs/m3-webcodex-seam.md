# M3 WebCodex durable-body seam

Packet: `WEB-M3-SEAM-001 rev 1`

## Source-first contract evidence

WebCodex source examined at exact commit:

`Penrix/webcodex@731b98b5fd7fc57e4ca4e1d0f21110278b14d008`

Relevant source/docs:

- `docs/GPT_ACTIONS.md` — GPT Actions are a transport projection of the same canonical ToolRuntime; Bearer auth; direct operations use canonical snake_case tool names and canonical input contracts.
- `src/openapi.rs` — direct Action path prefix is `/api/actions/`; direct operations use the canonical ToolSpec input schema; response is the canonical `ToolResult` envelope.
- `src/runtime_http.rs` — `gpt_action_invoke` calls `ToolRuntime.call_tool_with_context`; direct requests pass the JSON body as the canonical tool arguments; successful canonical results return HTTP 200, canonical business failures HTTP 400.
- `crates/webcodex-tool-contracts/src/tool_definition/files.rs` — `read_files` is Adaptive Direct, read-only, pure-read/idempotent and project-scoped.
- `crates/webcodex-tool-contracts/src/tool_call.rs` — canonical `read_files` arguments.
- `crates/webcodex-tool-runtime-contracts/src/tool_result.rs` — canonical result is `{ success, output, error? }`; structured output carries recovery data on failures.

Chosen transport: direct REST `POST /api/actions/read_files`.

Why REST rather than MCP for the first seam: WebCodex source proves the direct Action is an existing stable projection of the same ToolRuntime authority. It preserves Project authorization, Runner routing, path policy and ToolRuntime semantics while avoiding a new MCP client/protocol stack inside this repository. MCP remains the primary ChatGPT integration, but it is not required to prove this minimal DSH-to-runtime seam.

Authentication: HTTP Bearer using an operator-supplied WebCodex credential. At the pinned WebCodex commit, `read_files` requires `project:read` authority; a bearer lacking that scope is rejected before tool execution with HTTP 403. Windows Desktop Local Full Runtime should use its protected managed-user PAT file through `bearerTokenFile`; the credential value is loaded only at request time and is never model-visible. The older inline `bearerToken` form remains supported for compatibility/testing.

The installed root plugin exposes the seam only when `webcodexRead` is configured:

```yaml
config:
  webcodexRead:
    baseUrl: http://127.0.0.1:<actual-port>
    bearerTokenFile: C:\\...\\webcodex-user-token
    project: <exact runtime Project id>
```

For the current Windows Desktop managed-pairing path, the safe source of these values is documented in [m3-webcodex-windows-boot.md](./m3-webcodex-windows-boot.md): `desktop-state.json` supplies the non-secret base URL, PAT file path and `runtime_project_id`; the helper never prints the PAT.

The M1 plugin keeps only `llm` as a hard dependency. When this optional config exists it uses Cordis `ctx.inject(['tools'], ...)`, so the capability is registered when the real DSH ToolRuntime service is present and is absent otherwise.

## Exact read-only contract used

The WebCodex request sent by this seam is:

```json
{
  "project": "<operator-pinned registered project id>",
  "items": [
    {
      "path": "project/relative/file",
      "start_line": 1,
      "limit": 20,
      "expected_read_revision": 123
    }
  ],
  "with_line_numbers": false,
  "max_result_bytes": 65536
}
```

Only `project` and `items` are required by the canonical contract. The seam deliberately does not expose `project` to the model: the operator pins one exact registered Project when registering the DSH tool. It also omits WebCodex `session_id`; DSH remains the caller/session owner and this packet does not mirror a WebCodex Workflow Session.

The DSH-facing tool is `webcodex_read_files`. Its arguments are only the canonical read-only fields that remain after the pinned Project is injected:

- `items`: canonical WebCodex contract is 1..8 entries with `path`, optional `start_line`, `limit`, `expected_read_revision`;
- optional `with_line_numbers`;
- optional `max_result_bytes`.

DSH 0.1.5-rc.2's enforced raw tool-schema subset does not support numeric/array length keywords such as `minimum` or `minItems`. The DSH projection therefore validates the object/array/scalar shape and required fields through the official `defineTool(...)` path, while WebCodex remains authoritative for the exact 1..8/range/revision constraints. The bridge does not maintain a second validator that can drift from WebCodex.

The returned DSH canonical value is the exact WebCodex ToolResult envelope:

```json
{
  "success": true,
  "output": {}
}
```

or, for a canonical business failure:

```json
{
  "success": false,
  "output": {
    "project": "<resolved Project id>",
    "state_changed": false,
    "error_kind": "runner_unavailable",
    "retry_guidance": "retry read_files after the owning Runner is available"
  },
  "error": "read_files could not bind the read snapshot to an active Runner process; retry after the Runner is available"
}
```

A valid `ToolResult` is the authoritative business outcome. The DSH bridge invocation is considered transport-successful when it obtained that canonical value, so callers must branch on the returned `success` field. This is intentional: throwing on `success:false` would discard WebCodex's structured failure/recovery payload and replace machine truth with prose. The failure example above is copied from the real `read_files` Runner-unavailable path at the pinned WebCodex commit; it is not an invented bridge taxonomy.

Non-`ToolResult` HTTP/auth/protocol failures become a DSH tool failure with stable code `WEBCODEX_HTTP_ERROR`. Network/transport failures become `WEBCODEX_TRANSPORT_ERROR`. The seam performs no retry.

## Authority boundary

- DSH owns the invoking Session and DSH tool result.
- WebCodex owns Project resolution, file/Git/Job/effect truth and canonical business success/failure.
- The seam stores no Project catalog, Workflow Session, Job or effect ledger.
- No model text is parsed for success.
- No write/effectful WebCodex tool is exposed by this packet.
- The Project id is pinned at registration and copied verbatim into every request.
- The Bearer credential is never part of the model-visible schema.
- Windows Desktop acceptance prefers the protected `bearerTokenFile` handoff; the path may be persisted, the token value must not be printed or committed.
- Future effectful seams must reconcile outcome-unknown before retry; this read-only seam retries nothing.

## Windows live acceptance

This packet still requires live evidence from the user's Windows machine with a real local WebCodex Server + Runner and one harmless registered Project.

Required live check:

1. Start/reuse the real WebCodex Server + Runner.
2. Register `webcodex_read_files` with the Server base URL, a real Bearer credential and one exact registered Project id.
3. Through DSH ToolRuntime, request a bounded range from a known harmless file.
4. Compare the returned `ToolResult.output` file/range fact to the local repository.
5. Repeat with a deliberately invalid Project/path/tool input that produces a canonical WebCodex failure and confirm `success:false` plus structured recovery is preserved.
6. Do not start a Job in this packet. Existing Job observation remains the next M3 step unless a live read reveals a blocker first.

Until those steps are executed on Windows, live Server/Runner success and failure are **未验证**.
