# Windows M1 Desktop-first acceptance

> Current authority: ADR-0007. The official DeepSeek Harness Desktop **Plugins** page is the M1 installation authority. The terminal embedded E2E script is diagnostic only.

## 1. Stage the exact candidate

From an exact checkout/worktree of Draft PR #18:

```powershell
$Head = (git rev-parse HEAD).Trim()
.\scripts\m1-local.ps1 -Action Stage -ExpectedHead $Head
```

When CI already owns repository validation, a local handoff may use `-SkipRepositoryChecks` after the exact head has built successfully.

Staging records the exact source head, absolute tarball path and SHA-256.

## 2. Emit the non-destructive Desktop UI install plan

```powershell
.\scripts\m1-local.ps1 -Action DesktopUiInstallPlan -ExpectedHead $Head
```

This does not mutate the Desktop profile. It prints and records:

- exact local `.tgz` path;
- SHA-256;
- observed Desktop executable/version;
- read-only profile snapshot;
- the official UI steps.

## 3. Install through the real Desktop

Keep the official Desktop running.

In the sidebar:

```text
Plugins
→ Add plugin
→ paste the exact absolute .tgz path
→ Install
→ Enable now
```

The Desktop Host owns spec inspection, compatibility checks, package/profile mutation, rollback on failure and bundle activation.

Do not hand-edit the profile and do not require the CLI carrier for this path.

After installation, optional readback is:

```powershell
.\scripts\m1-local.ps1 -Action DesktopReadback
```

Expected:

```text
dependency != null
bundleSelected = true
```

## 4. Prove provider discovery before any Web Send

In the actual Desktop model selector, verify the Penrix ChatGPT Web provider/models are present, including `chatgpt-web/high`.

If absent, stop. This is a Desktop composition problem and must consume **0 ChatGPT Web inferences**.

## 5. One plain Desktop inference

Select `chatgpt-web/high` and send one simple non-tool prompt.

The real plugin defaults to `allowInteractiveLogin=false`. Existing login must be reused automatically or the run stops before Send.

PASS:

```text
Desktop Session
→ @penrix/dsh-chatgpt-web
→ embedded managed Chrome
→ existing login reuse
→ ChatGPT Web
→ one final assistant reply
→ same Desktop Session
```

## 6. Desktop tool-loop acceptance

Only after the plain inference works, exercise one harmless/read-only DSH tool from the same product surface.

PASS:

```text
Desktop Session
→ ChatGPT Web inference #1
→ one DSH tool proposal
→ ToolRuntime executes exactly once
→ tool/call + tool/result persist in the same Session
→ ChatGPT Web inference #2
→ final answer in Desktop
```

No blind resend is allowed after a possibly-sent turn. Automatic DSH host retries remain disabled.

## Diagnostic harness

```powershell
npm run m1:diagnostic:e2e-live
```

This is diagnostic only and cannot establish Desktop LIVE VERIFIED.

## Evidence class

Until the current exact candidate completes the real Desktop flow above:

**CODE VERIFIED, LIVE UNVERIFIED**
