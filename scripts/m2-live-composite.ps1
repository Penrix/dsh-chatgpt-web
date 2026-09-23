param(
  [string]$IntegrationRef = "web-win-live-001",
  [string]$ExpectedIntegrationHead = "",
  [string]$ProfileDir = "",
  [string]$Model = "chatgpt-web/high",
  [string]$EvidencePath = "",
  [switch]$SkipRegression,
  [switch]$KeepWorktree
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$Repo = (git rev-parse --show-toplevel).Trim()
if (-not $Repo) { throw "Run this script inside Penrix/dsh-chatgpt-web." }

$M2Branch = "web-m2-live-004"
$RequiredM2Paths = @(
  "docs/m2-live-acceptance.md",
  "scripts/m2-live.mjs"
)

Write-Host "Fetching current Windows integration and M2 source refs..."
$IntegrationRefspec = "+refs/heads/" + $IntegrationRef + ":refs/remotes/origin/" + $IntegrationRef
$M2Refspec = "+refs/heads/" + $M2Branch + ":refs/remotes/origin/" + $M2Branch
& git -C $Repo fetch origin $IntegrationRefspec $M2Refspec
if ($LASTEXITCODE -ne 0) { throw "git fetch failed" }

$IntegrationHead = (git -C $Repo rev-parse ("origin/" + $IntegrationRef)).Trim()
$M2SourceHead = (git -C $Repo rev-parse ("origin/" + $M2Branch)).Trim()
if (-not $IntegrationHead) { throw "Unable to resolve current integration head for $IntegrationRef." }
if (-not $M2SourceHead) { throw "Unable to resolve current M2 source head." }

if ($ExpectedIntegrationHead -and $IntegrationHead -ne $ExpectedIntegrationHead) {
  throw "Integration head moved: expected $ExpectedIntegrationHead, got $IntegrationHead"
}

$Stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$Worktree = Join-Path $env:TEMP "dsh-chatgpt-web-m2-win-live-$Stamp"

try {
  Write-Host "Creating detached worktree from current integration head $IntegrationHead"
  git -C $Repo worktree add --detach $Worktree $IntegrationHead
  if ($LASTEXITCODE -ne 0) { throw "git worktree add failed" }

  Push-Location $Worktree
  try {
    foreach ($Path in $RequiredM2Paths) {
      git checkout $M2SourceHead -- $Path
      if ($LASTEXITCODE -ne 0) { throw "failed to overlay M2-owned path: $Path" }
    }

    $OverlayPaths = @((git diff --name-only HEAD) | ForEach-Object { $_.Trim() } | Where-Object { $_ })
    $Unexpected = @($OverlayPaths | Where-Object { $_ -notin $RequiredM2Paths })
    $Missing = @($RequiredM2Paths | Where-Object { $_ -notin $OverlayPaths })
    if ($Unexpected.Count -gt 0 -or $Missing.Count -gt 0) {
      throw "M2 overlay path mismatch. Unexpected=[$($Unexpected -join ', ')] Missing=[$($Missing -join ', ')]"
    }

    $Package = Get-Content -LiteralPath (Join-Path $Worktree "package.json") -Raw | ConvertFrom-Json
    if ($Package.scripts.'m2:live' -ne "npm run build && node scripts/m2-live.mjs") {
      throw "Current integration head does not contain the required M2 script wiring."
    }
    if ($Package.devDependencies.'meow-memory' -ne "0.27.0") {
      throw "Current integration head does not pin meow-memory@0.27.0."
    }

    # Old WEB-M2-LIVE-004 composite metadata described PR #10/#11, not the
    # current Windows integration head. Remove it so it cannot misrepresent this run.
    Get-ChildItem Env:M2_LIVE_COMPOSITE_* -ErrorAction SilentlyContinue | Remove-Item -ErrorAction SilentlyContinue

    $env:M2_WIN_INTEGRATION_REF = $IntegrationRef
    $env:M2_WIN_INTEGRATION_HEAD = $IntegrationHead
    $env:M2_WIN_M2_SOURCE_HEAD = $M2SourceHead
    $env:M2_WIN_OVERLAY_PATHS = ($OverlayPaths -join ",")
    $env:M2_CHATGPT_MODEL = $Model

    if ($ProfileDir) {
      $env:M2_CHATGPT_PROFILE = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($ProfileDir)
    }
    if ($EvidencePath) {
      $env:M2_LIVE_EVIDENCE = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($EvidencePath)
    }

    Write-Host "WINDOWS INTEGRATION REF: $IntegrationRef"
    Write-Host "WINDOWS INTEGRATION HEAD: $IntegrationHead"
    Write-Host "M2 SOURCE HEAD: $M2SourceHead"
    Write-Host "M2 OVERLAY: $($OverlayPaths -join ', ')"
    if ($env:M2_CHATGPT_PROFILE) {
      Write-Host "PROFILE: $env:M2_CHATGPT_PROFILE"
    } else {
      Write-Host "PROFILE: default dedicated provider profile (~/.dsh-chatgpt-web-penrix/chrome-profile)"
    }

    Write-Host "Installing exact current integration dependency graph..."
    npm install --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw "npm install failed" }

    if (-not $SkipRegression) {
      Write-Host "Running current integration regression checks before M2 live..."
      npm run typecheck
      if ($LASTEXITCODE -ne 0) { throw "typecheck failed" }
      npm test
      if ($LASTEXITCODE -ne 0) { throw "tests failed" }
      npm run build
      if ($LASTEXITCODE -ne 0) { throw "build failed" }
      npm run smoke:load
      if ($LASTEXITCODE -ne 0) { throw "smoke:load failed" }
      npm run smoke:pack
      if ($LASTEXITCODE -ne 0) { throw "smoke:pack failed" }
    }

    Write-Host "Starting WEB-M2-WIN-LIVE-005 real Windows/browser acceptance..."
    npm run m2:live
    if ($LASTEXITCODE -ne 0) {
      throw "m2:live exited with code $LASTEXITCODE. Inspect the evidence JSON for the first exact blocker."
    }
  }
  finally {
    Pop-Location
  }
}
finally {
  if ((Test-Path $Worktree) -and -not $KeepWorktree) {
    git -C $Repo worktree remove --force $Worktree
  }
  elseif (Test-Path $Worktree) {
    Write-Host "Kept M2 Windows worktree: $Worktree"
  }
}
