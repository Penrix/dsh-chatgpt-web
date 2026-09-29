# Windows M1 Desktop-first acceptance

> Current authority: ADR-0007. The real DeepSeek Harness Desktop is the M1 product entrypoint. The terminal embedded E2E script is diagnostic only.

## 1. Stage the exact candidate

From an exact checkout/worktree of Draft PR #18:

```powershell
$Head = (git rev-parse HEAD).Trim()
.\scripts\m1-local.ps1 -Action Stage -ExpectedHead $Head
```

Staging is non-destructive. It runs repository checks, builds and packs the plugin, records the exact source head and tarball SHA-256, and takes a forensic readback of Desktop profile metadata.

## 2. Prepare the Desktop-owned install

DeepSeek Harness Desktop must have been opened at least once so its reserved profile exists.

```powershell
.\scripts\m1-local.ps1 -Action DesktopInstallPlan -ExpectedHead $Head
```

The plan resolves both the installed Desktop executable and Desktop's own
`resources\runtime\cli\bin\dsh.cmd`. The npm-installed public `dsh` is not permitted to mutate `profiles/desktop`.

## 3. Install into the real Desktop profile

Fully quit DeepSeek Harness Desktop, including its Windows tray process. Then:

```powershell
.\scripts\m1-local.ps1 -Action DesktopInstall -ExpectedHead $Head
```

The script fails if Desktop is still running and never kills it automatically. Its mutation boundary is:

```text
<Desktop install>\resources\runtime\cli\bin\dsh.cmd
  plugin --profile desktop add <exact staged tarball>
```

That upstream-supported command owns the Desktop profile lock, bundled pnpm runtime, compatibility checks and bundle reconciliation.

A successful action must read back:

```text
dependency != null
bundleSelected = true
```

and writes `desktop-install-receipt.json`.

## 4. Prove Desktop provider discovery before any Web Send

Reopen the real Desktop. Before sending anything to ChatGPT Web, verify in the Desktop conversation model selector that the Penrix ChatGPT Web provider/models are present, including `chatgpt-web/high`.

This proves:

```text
real Desktop
→ reserved desktop profile
→ @penrix/dsh-chatgpt-web loaded
→ ctx.llm catalog
→ Desktop model selector
```

If the provider/models are absent, stop there. Do not spend ChatGPT Web quota diagnosing a Desktop composition failure.

## 5. One plain Desktop inference

Select `chatgpt-web/high` in the real Desktop and send one simple non-tool prompt.

The real plugin defaults to `allowInteractiveLogin=false`. Acceptance may reuse the existing DSH ChatGPT login or fail closed. It must not ask the owner to sign in again automatically.

PASS for this layer is:

```text
Desktop Session
→ @penrix/dsh-chatgpt-web
→ embedded managed Chrome
→ existing login reuse
→ ChatGPT Web
→ one final assistant reply
→ same Desktop Session
```

If login reuse fails before Send, stop with zero model inferences.

## 6. Desktop tool-loop acceptance

Only after the plain Desktop inference works, exercise one harmless DSH tool from the same product surface.

PASS requires:

```text
Desktop Session
→ ChatGPT Web inference #1
→ exact DSH tool proposal
→ DSH ToolRuntime executes exactly once
→ tool/call + tool/result persist in the same Session
→ ChatGPT Web inference #2
→ final assistant answer in Desktop
```

No blind resend is allowed after a possibly-sent turn. Automatic DSH host retries remain disabled.

## Diagnostic harness

```powershell
npm run m1:diagnostic:e2e-live
```

This remains useful to isolate provider/tool-loop defects without Desktop UI. It is not the M1 product acceptance entrypoint and cannot establish Desktop LIVE VERIFIED.

## Evidence class

Until the current exact candidate completes the real Desktop flow above:

**CODE VERIFIED, LIVE UNVERIFIED**

A future LIVE VERIFIED receipt must bind the exact DSH commit, Desktop/runtime version, installation receipt, provider/model discovery, actual Web inference count and actual DSH tool execution count.
