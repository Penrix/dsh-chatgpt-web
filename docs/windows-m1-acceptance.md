# Windows M1 local acceptance

> Candidate branch: `web-m1-001-rev2`
> Target verified in WEB-M1-001 rev 2: DSH Desktop 2.0.13; DSH packages 0.1.5-rc.2; Cordis 4.0.2; Schemastery 3.18.2; Node 24.16.0; npm 11.13.0.

Keep repository validation, isolated DSH profile validation, and the real Desktop profile as three separate steps.

## 1. Repository-only validation (touches no DSH profile)

Run from an existing checkout of `Penrix/dsh-chatgpt-web`:

```powershell
git fetch origin web-m1-001-rev2
$Worktree = Join-Path $env:TEMP "dsh-chatgpt-web-m1-$PID"
git worktree add $Worktree origin/web-m1-001-rev2
Set-Location $Worktree

node --version
npm --version
npm install --no-audit --no-fund
npm run typecheck
npm test
npm run build
npm run smoke:load
npm run smoke:pack
```

`smoke:load` imports the built `lib/index.js`, validates package/bundle entrypoints and registers the adapter against a fake DSH LLM seam. It does not launch a browser or require ChatGPT login.

## 2. Isolated DSH load smoke (never touches the real Desktop profile)

The public CLI can manage ordinary profiles such as `web`, but **cannot manage Desktop's reserved `desktop` profile**. Use a disposable `DSH_HOME`:

```powershell
$IsolatedHome = Join-Path $env:TEMP "dsh-chatgpt-web-m1-home-$PID"
New-Item -ItemType Directory -Force $IsolatedHome | Out-Null
$env:DSH_HOME = $IsolatedHome

dsh --version
dsh plugin --profile web add $Worktree
dsh --profile web --dump-default-config | Out-File -Encoding utf8 (Join-Path $IsolatedHome "effective-config.txt")
```

Expected scope of this step: package/profile resolution and Loader composition only. Do not count it as real ChatGPT Web inference or tool-loop acceptance.

### Isolated recovery

After the isolated process is stopped:

```powershell
Remove-Item Env:DSH_HOME
if ($IsolatedHome -like (Join-Path $env:TEMP 'dsh-chatgpt-web-m1-home-*')) {
  Remove-Item -Recurse -Force $IsolatedHome
}
Set-Location (git rev-parse --show-toplevel)
git worktree remove $Worktree --force
```

Never substitute the user's normal Harness home for `$IsolatedHome` in this cleanup.

## 3. Prepare the candidate for normal DSH Desktop

Desktop exclusively owns `$DSH_HOME/profiles/desktop`; the public CLI must not install into or modify that profile.

Build a local tarball from the candidate:

```powershell
Set-Location $Worktree
npm run build
$Pack = (npm pack --json | ConvertFrom-Json)[0].filename
$Candidate = (Resolve-Path $Pack).Path
$Candidate
```

Then use DSH Desktop's shared **Plugins** page to install the local package/tarball and enable its bundle. Do not edit `$DSH_HOME/profiles/desktop/package.json`, `node_modules`, lockfiles, or `cordis.patch.yml` by hand.

The package defaults to a dedicated ChatGPT browser profile under `~/.dsh-chatgpt-web-penrix/chrome-profile`; it does not reuse the user's ordinary browser profile. The headed ChatGPT window should only be required when the first real inference is attempted.

## 4. Real M1 Desktop acceptance (reserved for local/Codex)

Only this proves Issue #1's real loop:

```text
DSH Session
→ ChatGPT Web inference
→ harmless DSH tool proposal
→ DSH executes tool
→ durable tool/result
→ second ChatGPT Web inference
→ final answer
```

Also force one ambiguous post-Send failure and verify the provider does not blindly resend.

## 5. Real Desktop recovery

If Desktop still reaches the Plugins page, disable/remove `@penrix/dsh-chatgpt-web` there.

If a third-party plugin prevents the Host from reaching the normal UI, use Desktop's native recovery action. Current DSH Desktop recovery disables third-party bundles and backs up the profile patch; it preserves Harness conversations/product data and installed package files.

Do **not**:

- run the public CLI against the reserved `desktop` profile;
- delete `$DSH_HOME`;
- delete `$DSH_HOME/profiles/desktop`;
- replace Desktop lockfiles or `node_modules` manually;
- copy the dedicated ChatGPT profile over the user's normal browser profile.
