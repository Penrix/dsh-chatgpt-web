[CmdletBinding()]
param(
  [ValidateSet('Prepare','Live','ResumeM2')]
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
  if (-not $value) { throw "$Name is required for the live M3 phase." }
  return $value
}

function Set-M2Environment([string]$EvidencePath) {
  $env:M2_CHATGPT_PROFILE = $ProfileDir
  $env:M2_LIVE_EVIDENCE = $EvidencePath
  Get-ChildItem Env:M2_LIVE_COMPOSITE_* -ErrorAction SilentlyContinue | Remove-Item -ErrorAction SilentlyContinue
  $env:M2_WIN_INTEGRATION_REF = $ExpectedBranch
  $env:M2_WIN_INTEGRATION_HEAD = $Head
  $env:M2_WIN_M2_SOURCE_HEAD = '72d56f08cb2e4dc0039af1003091ebd5e0b28631'
  $env:M2_WIN_OVERLAY_PATHS = 'docs/m2-live-acceptance.md,scripts/m2-live.mjs,scripts/m2-live-composite.ps1,scripts/m2-home-scope.mjs,scripts/m2-profile-quiescence.mjs,scripts/m2-reasoning-diagnostic.mjs,scripts/m2-dream-gate.mjs,tests/m2-home-scope.test.ts,tests/m2-profile-quiescence.test.ts,tests/m2-reasoning-diagnostic.test.ts,tests/m2-dream-gate.test.ts'
  Remove-Item Env:M2_WIN_CHANGED_PATHS -ErrorAction SilentlyContinue
}

function Wait-M2ProfileQuiescence {
  Write-Host ''
  Write-Host '=== M2 dedicated profile quiescence ==='
  Invoke-Checked node @('scripts/m2-profile-quiescence.mjs', '--profile', $ProfileDir)
}

function Invoke-M3Live([string]$M3EvidencePath) {
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
  $env:WEBCODEX_LIVE_EVIDENCE = $M3EvidencePath

  Write-Host ''
  Write-Host '=== M3 live WebCodex read-only seam ==='
  Invoke-Checked node @('scripts/windows-live-m3.mjs')
}

function Assert-ExistingM1Pass([string]$EvidencePath) {
  if (-not (Test-Path -LiteralPath $EvidencePath -PathType Leaf)) {
    throw "ResumeM2 requires the existing M1 PASS evidence file: $EvidencePath"
  }
  $m1 = Get-Content -LiteralPath $EvidencePath -Raw | ConvertFrom-Json
  if (-not $m1.accepted) {
    throw "ResumeM2 refuses to skip M1 because the supplied M1 evidence is not accepted=true."
  }
  if (-not $m1.profileDir) {
    throw "ResumeM2 M1 evidence does not record profileDir."
  }
  $recordedProfile = [IO.Path]::GetFullPath([string]$m1.profileDir)
  if (-not [string]::Equals($recordedProfile, $ProfileDir, [StringComparison]::OrdinalIgnoreCase)) {
    throw "ResumeM2 profile mismatch. M1 evidence profile=$recordedProfile current profile=$ProfileDir"
  }
  return $m1
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
    Set-M2Environment (Join-Path $EvidenceRoot 'm2-live.json')

    Write-Host ''
    Write-Host '=== M1 live ChatGPT Web echo ==='
    Invoke-Checked node @('scripts/m1-live-echo.mjs')

    Wait-M2ProfileQuiescence

    Write-Host ''
    Write-Host '=== M2 live meow-memory ==='
    Invoke-Checked node @('scripts/m2-live.mjs')

    Invoke-M3Live (Join-Path $EvidenceRoot 'm3-live.json')

    $summary = [pscustomobject]@{
      packet = 'WEB-WIN-LIVE-001 rev 1'
      phase = 'Live'
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

  'ResumeM2' {
    New-Item -ItemType Directory -Force $EvidenceRoot | Out-Null

    Write-Host "WEB-WIN-LIVE-001 RESUME M2"
    Write-Host "HEAD: $Head"
    Write-Host "PROFILE: $ProfileDir"
    Write-Host "EVIDENCE: $EvidenceRoot"

    $env:M1_LIVE_EVIDENCE = Join-Path $EvidenceRoot 'm1-live.json'
    $m1 = Assert-ExistingM1Pass $env:M1_LIVE_EVIDENCE
    Write-Host "Preserving existing M1 PASS evidence: $env:M1_LIVE_EVIDENCE"
    Write-Host "M1 completedAt: $($m1.completedAt)"

    Set-M2Environment (Join-Path $EvidenceRoot 'm2-live-resume-after-m1-017.json')
    Wait-M2ProfileQuiescence

    Write-Host ''
    Write-Host '=== M2 live meow-memory (resume; M1 not rerun) ==='
    Invoke-Checked node @('scripts/m2-live.mjs')

    Invoke-M3Live (Join-Path $EvidenceRoot 'm3-live.json')

    $summary = [pscustomobject]@{
      packet = 'WEB-M2-WIN-LIVE-009 rev 1'
      phase = 'ResumeM2'
      head = $Head
      profileDir = $ProfileDir
      preservedM1Evidence = $env:M1_LIVE_EVIDENCE
      m2Evidence = $env:M2_LIVE_EVIDENCE
      m3Evidence = $env:WEBCODEX_LIVE_EVIDENCE
      completedAt = (Get-Date).ToUniversalTime().ToString('o')
    }
    $summaryPath = Join-Path $EvidenceRoot 'windows-live-resume-m2-summary.json'
    $summary | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $summaryPath -Encoding utf8

    Write-Host ''
    Write-Host 'WEB-M2-WIN-LIVE-009 RESUME: PASS'
    Write-Host "SUMMARY: $summaryPath"
    break
  }
}
