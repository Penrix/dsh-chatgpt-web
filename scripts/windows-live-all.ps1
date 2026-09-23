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
    Write-Host 'Install through DSH Desktop main app -> sidebar Plugins page (shared Web Plugin Manager) using the printed PLUGIN SPEC. Settings plugin inventory is read-only; do not use public dsh CLI against the reserved desktop profile.'
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
    Get-ChildItem Env:M2_LIVE_COMPOSITE_* -ErrorAction SilentlyContinue | Remove-Item -ErrorAction SilentlyContinue
    $env:M2_WIN_INTEGRATION_REF = $ExpectedBranch
    $env:M2_WIN_INTEGRATION_HEAD = $Head
    $env:M2_WIN_M2_SOURCE_HEAD = 'f098fb15eeec6df91974a031757bd1feadb314cd'
    $env:M2_WIN_OVERLAY_PATHS = 'docs/m2-live-acceptance.md,scripts/m2-live.mjs'
    Remove-Item Env:M2_WIN_CHANGED_PATHS -ErrorAction SilentlyContinue

    Write-Host ''
    Write-Host '=== M1 live ChatGPT Web echo ==='
    Invoke-Checked node @('scripts/m1-live-echo.mjs')

    Write-Host ''
    Write-Host '=== M2 live meow-memory ==='
    Invoke-Checked node @('scripts/m2-live.mjs')

    Write-Host ''
    Write-Host '=== M3 prerequisite check ==='
    $null = Assert-Env 'WEBCODEX_BASE_URL'
    $null = Assert-Env 'WEBCODEX_PROJECT'
    $inlineCredential = [Environment]::GetEnvironmentVariable('WEBCODEX_BEARER_TOKEN')
    $fileCredential = [Environment]::GetEnvironmentVariable('WEBCODEX_BEARER_TOKEN_FILE')
    if ([bool]$inlineCredential -eq [bool]$fileCredential) {
      throw 'Configure exactly one M3 credential source. Prefer WEBCODEX_BEARER_TOKEN_FILE from scripts\m3-webcodex-windows-preflight.ps1; inline WEBCODEX_BEARER_TOKEN remains compatibility-only.'
    }
    if ($fileCredential -and -not (Test-Path -LiteralPath $fileCredential -PathType Leaf)) {
      throw "WEBCODEX_BEARER_TOKEN_FILE does not exist: $fileCredential"
    }
    if (-not $env:WEBCODEX_LOCAL_ROOT) { $env:WEBCODEX_LOCAL_ROOT = $RepoRoot }
    $env:WEBCODEX_LIVE_EVIDENCE = Join-Path $EvidenceRoot 'm3-live.json'

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
