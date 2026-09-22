param(
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

$M1Base = "653995ea6d7ae014c3498c42082f263acde90185"
$Pr10Head = "ee4a3b8afcb467b56ee18bc7527044d1b30ba38a"
$Pr11Head = "d64791777248f21f70d32fb485ac75388472a254"
$LeafBranch = "web-m2-live-004"

Write-Host "Fetching exact M2/M1 acceptance refs..."
$LeafRefspec = "+refs/heads/" + $LeafBranch + ":refs/remotes/origin/" + $LeafBranch
$fetchArgs = @(
  "-C", $Repo, "fetch", "origin",
  $LeafRefspec,
  "+refs/heads/web-m1-val-005:refs/remotes/origin/web-m1-val-005",
  "+refs/heads/web-m1-safe-006:refs/remotes/origin/web-m1-safe-006"
)
& git @fetchArgs
if ($LASTEXITCODE -ne 0) { throw "git fetch failed" }

$LeafHead = (git -C $Repo rev-parse "origin/$LeafBranch").Trim()
$ResolvedPr10 = (git -C $Repo rev-parse "origin/web-m1-val-005").Trim()
$ResolvedPr11 = (git -C $Repo rev-parse "origin/web-m1-safe-006").Trim()

if ($ResolvedPr10 -ne $Pr10Head) {
  throw "PR #10 head moved: expected $Pr10Head, got $ResolvedPr10"
}
if ($ResolvedPr11 -ne $Pr11Head) {
  throw "PR #11 head moved: expected $Pr11Head, got $ResolvedPr11"
}

$Stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$Worktree = Join-Path $env:TEMP "dsh-chatgpt-web-m2-live-$Stamp"
$Patch10 = Join-Path $env:TEMP "dsh-m2-pr10-$Stamp.patch"
$Patch11 = Join-Path $env:TEMP "dsh-m2-pr11-$Stamp.patch"

try {
  Write-Host "Creating detached Windows composite worktree at $LeafHead"
  git -C $Repo worktree add --detach $Worktree $LeafHead
  if ($LASTEXITCODE -ne 0) { throw "git worktree add failed" }

  git -C $Repo diff --binary "$M1Base..$Pr10Head" | Set-Content -Encoding utf8 $Patch10
  git -C $Repo diff --binary "$M1Base..$Pr11Head" | Set-Content -Encoding utf8 $Patch11

  Push-Location $Worktree
  try {
    git apply --3way $Patch10
    if ($LASTEXITCODE -ne 0) { throw "failed to apply accepted PR #10 delta" }
    git apply --3way $Patch11
    if ($LASTEXITCODE -ne 0) { throw "failed to apply accepted PR #11 delta" }

    $CompositeDiff = (git diff --stat | Out-String).Trim()
    Write-Host "Temporary composite delta:"
    Write-Host $CompositeDiff

    $env:M2_LIVE_COMPOSITE_LEAF_HEAD = $LeafHead
    $env:M2_LIVE_COMPOSITE_M1_BASE = $M1Base
    $env:M2_LIVE_COMPOSITE_PR10_HEAD = $Pr10Head
    $env:M2_LIVE_COMPOSITE_PR11_HEAD = $Pr11Head
    $env:M2_LIVE_COMPOSITE_DIFF_STAT = $CompositeDiff
    $env:M2_CHATGPT_MODEL = $Model

    if ($ProfileDir) {
      $env:M2_CHATGPT_PROFILE = (Resolve-Path $ProfileDir).Path
    }
    if ($EvidencePath) {
      $env:M2_LIVE_EVIDENCE = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($EvidencePath)
    }

    Write-Host "Installing exact dependency graph..."
    npm install --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw "npm install failed" }

    if (-not $SkipRegression) {
      Write-Host "Running composite regression checks..."
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

    Write-Host "Starting WEB-M2-LIVE-004 real Windows/browser acceptance..."
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
  Remove-Item -Force -ErrorAction SilentlyContinue $Patch10, $Patch11
  if ((Test-Path $Worktree) -and -not $KeepWorktree) {
    git -C $Repo worktree remove --force $Worktree
  }
  elseif (Test-Path $Worktree) {
    Write-Host "Kept composite worktree: $Worktree"
  }
}
