# Windows M1 local acceptance

> Active packet: `WEB-M1-LIVE-008 rev 1`
> Candidate branch: `web-m1-live-008`
> Target: DSH Desktop 2.0.13; DSH packages 0.1.5-rc.2; Cordis 4.0.2; Schemastery 3.18.2.

## Safety model

The local entrypoint is `scripts/m1-local.ps1`.

It deliberately separates four concerns:

```text
Stage candidate
→ optional isolated DSH install/rollback
→ Desktop install preflight + backup/readback
→ actual Desktop mutation only through the main application's sidebar Plugins page / shared Web Plugin Manager; Settings plugin inventory is read-only and the public CLI must not mutate the reserved Desktop profile
```

The script never writes `$DSH_HOME/profiles/desktop` and never edits the installed DSH Desktop application tree.

Machine-specific roots are parameters; defaults derive from `%TEMP%`, `$DSH_HOME` / `~/.dsh`, and `%LOCALAPPDATA%\Programs\DSH Desktop`. No username is hard-coded.

## 1. Create an isolated worktree

From an existing checkout:

```powershell
git fetch origin web-m1-live-008
$Worktree = Join-Path $env:TEMP "dsh-chatgpt-web-m1-$PID"
git worktree add --detach $Worktree origin/web-m1-live-008
Set-Location $Worktree
```

Before staging, Codex should record the exact checked-out commit:

```powershell
$Head = (git rev-parse HEAD).Trim()
$Head
```

## 2. Stage — default, non-destructive path

```powershell
.\scripts\m1-local.ps1 -Action Stage -ExpectedHead $Head
```

`Stage` refuses a dirty checkout, a wrong named branch, or a wrong `-ExpectedHead`. A detached worktree is accepted only when `-ExpectedHead` is explicitly supplied and exactly matches `HEAD`. Unless `-SkipRepositoryChecks` is explicitly supplied, it runs:

```text
npm install --no-audit --no-fund --package-lock=false
npm run typecheck
npm test
npm run build
npm run smoke:load
npm run smoke:pack
npm pack --json
```

The `npm run smoke:load` check imports the built candidate into a real in-process Cordis `Context`, mounts the real DSH `LlmRuntime`, applies this provider, and verifies provider/model registration plus package bundle metadata. That is an in-process load/registration check only: it does **not** prove DSH Desktop composition or installation, does not launch or authenticate a browser, and does not perform live ChatGPT Web inference or a real tool round-trip.

It then:

- writes the tarball under `%TEMP%\dsh-chatgpt-web-m1-stage` by default;
- verifies the packed package name and required `lib/index.js`, `lib/index.d.ts`, and `cordis.patch.yml`;
- records the tarball SHA-256 and exact Git head in `.penrix-m1-stage.json`;
- copies a **read-only forensic snapshot** of existing Desktop profile metadata (`package.json`, patch and pnpm metadata when present) into the stage directory.

The backup is evidence/readback material only. Do not restore those files manually into the live Desktop profile.

Re-run artifact verification without building:

```powershell
.\scripts\m1-local.ps1 -Action VerifyStage
```

## 3. Optional isolated DSH install

This is the only scripted install. It uses an owned `DSH_HOME` under `%TEMP%` and never targets the reserved Desktop profile.

Dry-run first:

```powershell
.\scripts\m1-local.ps1 -Action InstallIsolated -WhatIf
```

Then execute:

```powershell
.\scripts\m1-local.ps1 -Action InstallIsolated
```

The action re-verifies the staged tarball hash, refuses a non-TEMP isolated home, installs with:

```text
dsh plugin --profile web add <staged-tarball>
```

and writes `isolated-effective-config.txt` plus `isolated-install-readback.json` into the staging directory.

### Isolated rollback

```powershell
.\scripts\m1-local.ps1 -Action RollbackIsolated -WhatIf
.\scripts\m1-local.ps1 -Action RollbackIsolated
```

Rollback deletes only an isolated TEMP home carrying the tool's own `.penrix-m1-isolated.json` marker. It refuses the live `$DSH_HOME` and unowned directories.

## 4. Prepare the real DSH Desktop install

Do not use `dsh plugin --profile desktop`; Desktop owns the reserved profile and the public CLI is not its mutation interface.

Run the read-only preflight:

```powershell
.\scripts\m1-local.ps1 -Action DesktopInstallPlan
```

This action:

- re-verifies the staged tarball hash;
- resolves `%LOCALAPPDATA%\Programs\DSH Desktop` by default;
- requires `DSH Desktop.exe` and validates the observed product/file version starts with `2.0.13`;
- snapshots the current Desktop profile metadata into `desktop-before-install`;
- writes `desktop-install-plan.json` containing the exact tarball path, SHA-256, Desktop executable/version, profile path, backup metadata, install boundary and rollback boundary.

To open Desktop after the plan is created:

```powershell
.\scripts\m1-local.ps1 -Action DesktopInstallPlan -OpenDesktop
```

### Actual Desktop install — reserved for Codex

Codex must use **DSH Desktop main application → sidebar Plugins → install bundle** and supply the absolute tarball path printed as `PLUGIN SPEC` by the script.

That official Plugin Manager owns pnpm, profile locking, bundle selection, installation errors and rollback of failed package operations. Do not hand-edit:

- `$DSH_HOME\profiles\desktop\package.json`;
- `$DSH_HOME\profiles\desktop\cordis.patch.yml`;
- Desktop lockfiles or `node_modules`;
- the installed application directory.

## 5. Desktop readback after Codex installs/removes

After an install attempt:

```powershell
.\scripts\m1-local.ps1 -Action DesktopReadback
```

It writes `desktop-readback.json` and reports whether the live Desktop profile currently has an `@penrix/dsh-chatgpt-web` dependency and whether the bundle is selected. This action is read-only.

## 6. Desktop rollback

Prepare a read-only rollback report:

```powershell
.\scripts\m1-local.ps1 -Action DesktopRollbackPlan
```

Normal rollback is owned by **DSH Desktop main application → sidebar Plugins**: disable/remove `@penrix/dsh-chatgpt-web`, restart when the manager requests it, then run `DesktopReadback` again.

If the third-party plugin prevents normal Host startup, use **DSH Desktop native fatal recovery → disable third-party bundles**. Native recovery backs up the profile patch and preserves Harness conversations/product data and installed package files for repair.

Never restore the staged forensic backup by copying it over the live profile.

## 7. Real M1 runtime acceptance

After the exact candidate has passed staging/build checks, run the live harness from the same checkout:

```powershell
npm run build
node .\scripts\m1-live-echo.mjs
```

The harness uses the **real** `ChatGptWebAdapter`, real DSH `LlmRuntime` / Session / ToolRuntime / AgentLoop, and one acceptance-only `echo(text)` DSH tool. It opens the provider's dedicated persistent browser profile in headed mode. On first use, sign in to ChatGPT inside that dedicated browser window; the provider waits for authenticated composer readiness.

Optional environment overrides:

```powershell
$env:M1_MODEL = 'chatgpt-web/high'
$env:M1_PROFILE_DIR = "$HOME\.dsh-chatgpt-web-penrix\chrome-profile"
$env:M1_CHROME_EXECUTABLE = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
$env:M1_LIVE_EVIDENCE = "$env:TEMP\m1-live-evidence.json"
node .\scripts\m1-live-echo.mjs
```

Do not point `M1_PROFILE_DIR` at the user's ordinary Chrome profile. The default is already a dedicated provider-owned profile.

A passing live run must prove all of these from the same canonical DSH Session:

```text
real ChatGPT Web inference #1
→ assistant tool-call proposal
→ exactly one DSH echo execution
→ one tool/call Session event
→ one tool/result Session event
→ real ChatGPT Web inference #2
→ final assistant message
```

The harness fails unless the Session contains exactly two assistant messages, exactly one tool call/result, exactly one local echo execution, and the persisted ordering is:

```text
assistant/message
→ tool/call
→ tool/result
→ assistant/message
```

On success it prints:

```text
M1 live echo: PASS (real ChatGPT Web -> DSH echo -> second real inference)
EVIDENCE: <absolute JSON path>
```

The evidence file contains the exact Session event sequence. Because the current production path asserts the exact Temporary Chat URL both after navigation/onboarding and immediately before the irreversible Send boundary, a successful live run also proves that both real sends crossed that guard. The existing post-Send uncertainty behavior remains fail-closed and is not converted into a retry by this harness.

### Desktop installation evidence remains separate

The live harness proves the real provider/tool-loop runtime. It does **not** replace the DSH Desktop packaging/install proof.

For Desktop acceptance, still use:

```powershell
.\scripts\m1-local.ps1 -Action DesktopInstallPlan -OpenDesktop
# Use DSH Desktop main application → sidebar Plugins → install bundle with the printed PLUGIN SPEC.
.\scripts\m1-local.ps1 -Action DesktopReadback
```

A complete M1 receipt should therefore contain both:

1. Desktop install/readback evidence for the exact staged tarball; and
2. the live harness evidence JSON proving the real two-inference DSH tool loop.

If either path fails, preserve the first concrete error/evidence and stop rather than hand-editing the Desktop profile or blindly retrying a possibly-sent Web turn.
