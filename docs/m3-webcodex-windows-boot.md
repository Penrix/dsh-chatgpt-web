# M3 Windows Local Full Runtime bootstrap

Packet: `WEB-M3-WIN-BOOT-002 rev 1`

This is an **M3-only** prerequisite path for the existing read-only DSH → WebCodex seam. Missing WebCodex state must never block M1 or M2. This packet does not require OpenAI Secure Tunnel and does not change M1/M2 code or runtime acceptance.

## Source baseline inspected

Current WebCodex source was inspected at:

`Penrix/webcodex@731b98b5fd7fc57e4ca4e1d0f21110278b14d008`

The Windows path below is grounded in these exact files:

- `docs/desktop-install.zh-CN.md`
- `docs/desktop-guide.zh-CN.md`
- `README.md`
- `apps/desktop/src/features/onboarding/FirstRun.tsx`
- `apps/desktop/src/lib/desktop-api.ts`
- `apps/desktop/src/models/topology.ts`
- `apps/desktop/src-tauri/tauri.conf.json`
- `apps/desktop/src-tauri/src/lib.rs`
- `apps/desktop/src-tauri/src/models.rs`
- `apps/desktop/src-tauri/src/state.rs`
- `apps/desktop/src-tauri/src/webcodex/adapter.rs`
- `apps/desktop/src-tauri/src/webcodex/models.rs`
- `crates/webcodex-cli/src/webcodex_cli/login.rs`
- `src/pairing_http.rs`
- `src/auth/scopes.rs`
- `docs/AUTH_MODEL.md`
- `docs/CLI.md`
- `docs/PERSONAL_SETUP.md`
- `scripts/prepare_desktop_bundle.ps1`

## Exact Windows Desktop path

The supported ordinary Windows path is WebCodex Desktop **Local Full Runtime / 在此电脑使用 WebCodex**.

1. If WebCodex Desktop is not installed, download the **Windows x64 installer** from the WebCodex GitHub Releases page and install it. The current Desktop bundle is a per-user NSIS installation.
2. Launch **WebCodex Desktop**.
3. On the welcome page choose **在此电脑使用 WebCodex** / **Local Full Runtime**.
4. Click **选择文件夹** and select the exact harmless local repository that M3 will read. Do not use the Desktop management workspace as a substitute for the real target repository.
5. Click **配置 WebCodex**.
6. On Home, expand **查看运行诊断** and wait for:
   - Service: **Ready / 运行中**;
   - Runner: **Ready / 已连接**;
   - Project: **Ready**, with the displayed path exactly equal to the selected repository.
7. If Project reports `project_not_loaded`, use **重新加载项目**. Do not widen the allowed root or switch to an unrelated Runner.
8. Do **not** configure or start OpenAI Secure Tunnel for this M3 prerequisite. Local Full Runtime is sufficient.

Closing the Desktop window only hides it to the Windows tray. Use the tray **退出 WebCodex** action only when a true process restart is required.

## What Desktop actually establishes

`DesktopCore::configure_local_setup` proves that Local Full Runtime is not a UI-only flag:

1. it inspects the selected exact project path;
2. it prepares a local Server on a reserved loopback address;
3. it waits until the Server is HTTP-reachable;
4. it creates a one-time local pairing code;
5. it redeems that code with normal managed login;
6. it starts/reuses the exact local Runner and waits until it is online;
7. it activates the selected Project and waits until that exact runtime Project is online;
8. only then does it persist the runtime identity and publish Service + Runner + Project = Ready.

The final local readiness condition is the same condition used by Desktop itself:

`server == Ready && runner == Ready && project == Ready`.

Process existence alone is not readiness evidence.

## Non-secret state M3 may resolve

Desktop stores its normal state under the Tauri application-local data directory. On Windows the documented app-data root is:

`%LOCALAPPDATA%\dev.webcodex.desktop`

The Local Full Runtime identity is persisted in:

`%LOCALAPPDATA%\dev.webcodex.desktop\desktop-state.json`

The M3 preflight reads only these non-secret fields:

- `runtime.server_url` → the real local WebCodex Server base URL;
- `runtime.runner_config` → the Runner config path used for read-only status observation;
- `runtime.user_token_file` → **path only** to the protected managed-user PAT file;
- `runtime.runtime_project_id` → the exact Project address required by runtime tools;
- `runtime.project_id` → the shorter local Project id, diagnostic only;
- `project.path` and `project.runtime_project_id` → exact selected project/path cross-check.

For the DSH `webcodex_read_files` seam, use **`runtime.runtime_project_id`**, not the shorter `project_id`. WebCodex Desktop's own readiness check compares the live `ops projects` id to this runtime Project id.

The Desktop local Server URL must resolve to loopback for this path. A remote/non-loopback Server is a different topology and this preflight fails closed instead of silently treating it as local.

## Credential: managed-user PAT file, never bootstrap/Runner token

Desktop Local Full Runtime uses `ManagedPairing`.

The pairing enrollment source proves that it issues two different credentials:

- managed-user PAT: `wc_pat_*`;
- Runner token: `wc_agent_*`.

The managed-user PAT's default enrollment scopes include:

- `runtime:read`;
- `runner:manage`;
- `session:collaborate`;
- **`project:read`**;
- `project:write`;
- `job:run`.

`read_files` requires **`project:read`**, so the normal Desktop-created managed-user PAT already has the required read authority.

Do not use:

- `WEBCODEX_TOKEN` — Server bootstrap/admin credential;
- `wc_agent_*` — Runner transport credential;
- the one-time `wc_pair_*` pairing code.

`webcodex login` writes the PAT to a protected `webcodex-user-token` file and returns only the **file path** in its JSON metadata. Desktop persists that path as `runtime.user_token_file`.

M3 now prefers the same protected-file handoff:

```yaml
webcodexRead:
  baseUrl: http://127.0.0.1:<actual-port>
  bearerTokenFile: C:\...\webcodex-user-token
  project: agent:<runner-client-id>:<project-id>
```

The older inline `bearerToken` form remains supported for compatibility/testing, but Windows Desktop acceptance should use `bearerTokenFile`.

The seam reads the protected token file only at request time, in-process, and sends the value only as the HTTP Authorization header to the configured WebCodex Server. The token value is never added to the DSH model-facing tool schema or canonical result.

## Read-only Windows preflight

Run from the M3 branch checkout:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\m3-webcodex-windows-preflight.ps1 -Json
```

Optional exact-project guard:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\m3-webcodex-windows-preflight.ps1 `
  -ExpectedProjectPath 'C:\path\to\harmless-repo' -Json
```

The helper first resolves the saved Desktop state. For live readiness it needs the official `webcodex` CLI. It resolves, in order:

1. explicit `-WebCodexCli <path>`;
2. `webcodex` on PATH;
3. when a running Desktop process exposes the source-defined bundle layout, an actually-existing `webcodex-runtime\webcodex.exe` next to the Desktop executable.

The third path is observational only: the helper uses it **only if the file exists**. It never treats a process name or guessed path as readiness evidence.

If automatic CLI resolution is unavailable, pass the real bundled CLI explicitly:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\m3-webcodex-windows-preflight.ps1 `
  -WebCodexCli 'C:\exact\path\to\webcodex.exe' -Json
```

When the CLI is available, the helper performs only the same supported read-only observations used by Desktop:

- `webcodex server status ... --token-file <protected PAT file> --json`;
- `webcodex runner status ... --user-token-file <protected PAT file> --json`;
- `webcodex ops projects ... --token-file <protected PAT file> --json`.

It declares live-ready only when:

- Server reports `http_reachable=true`;
- Runner reports checked + reachable + client_online;
- the exact runtime Project id and path are present with `connected=true` and `agent_status=online`.

No write, Project activation, Job start, coding operation, Tunnel action, DSH profile edit, or M1/M2 operation is performed.

### Redaction guarantees

The preflight:

- never reads the PAT with PowerShell `Get-Content`;
- never prints the PAT;
- never prints raw WebCodex CLI stdout/stderr;
- passes only the protected PAT **file path** to official WebCodex CLI `--token-file` / `--user-token-file`;
- reports the credential only as `type=managed_user_pat`, file path, existence, and required scope;
- emits the safe M3 config triple `baseUrl + bearerTokenFile + runtime Project id`;
- never reads or reports the Server bootstrap token or Runner token.

Exit codes:

- `0`: Local Full Runtime live readiness proved;
- `2`: Desktop state/runtime prerequisite is missing or inconsistent;
- `3`: saved runtime identity is usable but official CLI could not be resolved, so live readiness remains unverified;
- `4`: official live observation ran but Service, Runner, or Project is not Ready.

## First Windows step from the current packet state

The authoritative packet state says no real WebCodex Server/Runner/Project/credential has yet been resolved.

Therefore the first product step is:

**Install/launch WebCodex Desktop → choose 在此电脑使用 WebCodex / Local Full Runtime → select the exact harmless local repository → 配置 WebCodex → wait for Service + Runner + Project Ready.**

This is an M3 prerequisite only. M1/M2 remain runnable and must not wait on it.

After Desktop is green, run `scripts/m3-webcodex-windows-preflight.ps1 -Json`. If it returns `ready=true`, its `dsh_webcodex_read` object contains the non-secret values needed to configure the existing M3 read seam without copying the PAT into DSH configuration.

## Final M3 read acceptance

Once preflight returns `ready=true`:

1. configure only the optional M3 `webcodexRead` capability from the emitted:
   - `baseUrl`;
   - `bearerTokenFile`;
   - `project` (runtime Project id);
2. keep PR #15 Draft and M1/M2 unchanged;
3. through real DSH ToolRuntime call `webcodex_read_files`;
4. request a bounded range from a harmless known file such as `README.md`;
5. require the canonical WebCodex `ToolResult`;
6. cross-check returned text/range against the same file on the Windows repository.

No write is required for `WEB-M3-WIN-BOOT-002`.

If preflight is not ready, the first reported `blocker` is the M3 blocker. Do not reinterpret it as an M1/M2 failure.
