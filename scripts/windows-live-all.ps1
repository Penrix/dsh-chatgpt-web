[CmdletBinding()]
param(
  [ValidateSet('Prepare','Live')]
  [string]$Phase = 'Prepare',
  [string]$ProfileDir,
  [string]$StageRoot,
  [string]$EvidenceRoot
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$ExpectedBranch = 'web-win-live-001'
$Head = (& git -C $RepoRoot rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or -not $Head) { throw 'Unable to resolve integration HEAD.' }

if (-not $StageRoot) { $StageRoot = Join-Path $env:TEMP 'dsh-chatgpt-web-win-live-stage' }
$StageRoot = [IO.Path]::GetFullPath($StageRoot)

if (-not $EvidenceRoot) { $EvidenceRoot = Join-Path $env:TEMP ('dsh-chatgpt-web-win-live-evidence-' + $Head.Substring(0,8)) }
$EvidenceRoot = [IO.Path]::GetFullPath($EvidenceRoot)

if (-not $ProfileDir) { $ProfileDir = Join-Path $HOME '.dsh-chatgpt-web-penrix\chrome-profile' }
$ProfileDir = [IO.Path]::GetFullPath($ProfileDir)

function Invoke-Checked {
  param(
    [Parameter(Mandatory=$true)][string]$FilePath,
    [Parameter(Mandatory=$true)][string[]]$Arguments
  )
  Push-Location $RepoRoot
  try {
    & $FilePath @Arguments
    if ($LASTEXITCODE -ne 0) { throw "Command failed ($LASTEXITCODE): $FilePath $($Arguments -join ' ')" }
  } finally {
    Pop-Location
  }
}

function Assert-Env([string]$Name) {
  $value = [Environment]::GetEnvironmentVariable($Name)
  if (-not $value) { throw "$Name is required for the Live phase." }
  return $value
}

switch ($Phase) {
  'Prepare' {
    Write-Host "WEB-WIN-LIVE-001 PREPARE"
    Write-Host "HEAD: $Head"
    Write-Host "PROFILE: $ProfileDir"
    Write-Host "STAGE: $StageRoot"

    & (Join-Path $RepoRoot 'scripts\m1-local.ps1') -Action Stage -RepoRoot $RepoRoot -StageRoot $StageRoot -ExpectedBranch $ExpectedBranch -ExpectedHead $Head
    if ($LASTEXITCODE -ne 0) { throw "M1 staging failed with exit code $LASTEXITCODE." }

    & (Join-Path $RepoRoot 'scripts\m1-local.ps1') -Action DesktopInstallPlan -RepoRoot $RepoRoot -StageRoot $StageRoot -OpenDesktop
    if ($LASTEXITCODE -ne 0) { throw "Desktop install plan failed with exit code $LASTEXITCODE." }

    Write-Host ''
    Write-Host 'PREPARE COMPLETE.'
    Write-Host 'Use DSH Desktop -> Plugins -> Add plugin with the PLUGIN SPEC printed above.'
    Write-Host 'After the Plugin Manager finishes, run this script again with -Phase Live using the same StageRoot/ProfileDir.'
    break
  }

  'Live' {
    New-Item -ItemType Directory -Force $EvidenceRoot | Out-Null

    Write-Host "WEB-WIN-LIVE-001 LIVE"
    Write-Host "HEAD: $Head"
    Write-Host "PROFILE: $ProfileDir"
    Write-Host "EVIDENCE: $EvidenceRoot"

    & (Join-Path $RepoRoot 'scripts\m1-local.ps1') -Action DesktopReadback -RepoRoot $RepoRoot -StageRoot $StageRoot
    if ($LASTEXITCODE -ne 0) { throw "Desktop readback failed with exit code $LASTEXITCODE." }

    $readbackPath = Join-Path $StageRoot 'desktop-readback.json'
    if (-not (Test-Path -LiteralPath $readbackPath -PathType Leaf)) { throw "Desktop readback evidence missing: $readbackPath" }
    $readback = Get-Content -LiteralPath $readbackPath -Raw | ConvertFrom-Json
    if (-not $readback.state.dependency) { throw 'Integrated candidate is not installed in the Desktop profile.' }
    if (-not $readback.state.bundleSelected) { throw 'Integrated candidate is installed but its Desktop bundle is not selected.' }

    $env:M1_PROFILE_DIR = $ProfileDir
    $env:M1_LIVE_EVIDENCE = Join-Path $EvidenceRoot 'm1-live.json'

    $env:M2_CHATGPT_PROFILE = $ProfileDir
    $env:M2_LIVE_EVIDENCE = Join-Path $EvidenceRoot 'm2-live.json'
    $env:M2_LIVE_COMPOSITE_LEAF_HEAD = $Head
    $env:M2_LIVE_COMPOSITE_M1_BASE = '653995ea6d7ae014c3498c42082f263acde90185'
    $env:M2_LIVE_COMPOSITE_PR10_HEAD = 'ee4a3b8afcb467b56ee18bc7527044d1b30ba38a'
    $env:M2_LIVE_COMPOSITE_PR11_HEAD = 'd64791777248f21f70d32fb485ac75388472a254'
    $env:M2_LIVE_COMPOSITE_DIFF_STAT = 'WEB-WIN-LIVE-001 integrated branch'
    $env:M2_LIVE_COMPOSITE_PATHS = 'docs/windows-m1-acceptance.md,scripts/smoke-load.mjs,scripts/smoke-pack.mjs,tests/prompt.test.ts,src/chatgpt/turn.ts,tests/send-boundary.test.ts'

    $null = Assert-Env 'WEBCODEX_BASE_URL'
    $null = Assert-Env 'WEBCODEX_BEARER_TOKEN'
    $null = Assert-Env 'WEBCODEX_PROJECT'
    if (-not $env:WEBCODEX_LOCAL_ROOT) { $env:WEBCODEX_LOCAL_ROOT = $RepoRoot }
    $env:WEBCODEX_LIVE_EVIDENCE = Join-Path $EvidenceRoot 'm3-live.json'

    Write-Host ''
    Write-Host '=== M1 live ChatGPT Web echo ==='
    Invoke-Checked node @('scripts/m1-live-echo.mjs')

    Write-Host ''
    Write-Host '=== M2 live meow-memory ==='
    Invoke-Checked node @('scripts/m2-live.mjs')

    Write-Host ''
    Write-Host '=== M3 live WebCodex read-only seam ==='
    Invoke-Checked node @('scripts/windows-live-m3.mjs')

    $summary = [pscustomobject]@{
      packet = 'WEB-WIN-LIVE-001 rev 1'
      head = $Head
      profileDir = $ProfileDir
      stageRoot = $StageRoot
      desktopReadback = $readbackPath
      m1Evidence = $env:M1_LIVE_EVIDENCE
      m2Evidence = $env:M2_LIVE_EVIDENCE
      m3Evidence = $env:WEBCODEX_LIVE_EVIDENCE
      completedAt = (Get-Date).ToUniversalTime().ToString('o')
    }
    $summaryPath = Join-Path $EvidenceRoot 'windows-live-summary.json'
    $summary | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $summaryPath -Encoding utf8

    Write-Host ''
    Write-Host 'WEB-WIN-LIVE-001: PASS'
    Write-Host "SUMMARY: $summaryPath"
    break
  }
}
