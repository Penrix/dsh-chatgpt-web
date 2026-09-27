[CmdletBinding()]
param(
  [ValidateSet('Prepare','Inspect','Live')]
  [string]$Phase = 'Inspect',
  [string]$ProfileName = 'penrix-chatgpt-web-headless',
  [string]$StageRoot,
  [string]$ChatGptProfileDir,
  [string]$EvidencePath,
  [string]$Prompt = 'Reply exactly OFFICIAL_CLI_OK and do not call tools.',
  [string]$DshCommand = 'dsh'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$ExpectedCliVersion = '0.1.7-rc.2'
$ExpectedProvider = 'chatgpt-web'
$ExpectedModel = 'chatgpt-web/high'
$PackageName = '@penrix/dsh-chatgpt-web'

if ([string]::Equals($ProfileName, 'headless', [StringComparison]::OrdinalIgnoreCase)) {
  throw 'Refusing to mutate the shipped headless profile. Choose an isolated custom profile name.'
}
if ([string]::Equals($ProfileName, 'desktop', [StringComparison]::OrdinalIgnoreCase)) {
  throw 'The desktop profile is Electron-owned and is not valid for this CLI acceptance.'
}

if (-not $StageRoot) {
  $StageRoot = Join-Path $env:TEMP 'dsh-chatgpt-web-official-cli'
}
$StageRoot = [IO.Path]::GetFullPath($StageRoot)
New-Item -ItemType Directory -Force $StageRoot | Out-Null

function Invoke-Captured {
  param(
    [Parameter(Mandatory=$true)][string]$FilePath,
    [Parameter(Mandatory=$true)][string[]]$Arguments,
    [switch]$AllowFailure
  )

  Push-Location $RepoRoot
  try {
    $output = @(& $FilePath @Arguments 2>&1)
    $code = $LASTEXITCODE
  } finally {
    Pop-Location
  }

  $text = ($output | ForEach-Object { [string]$_ }) -join [Environment]::NewLine
  if (-not $AllowFailure -and $code -ne 0) {
    if ($text) { Write-Host $text }
    throw "Command failed ($code): $FilePath $($Arguments -join ' ')"
  }
  return [pscustomobject]@{ ExitCode = $code; Text = $text }
}

function Assert-OfficialCli {
  $version = Invoke-Captured $DshCommand @('--version')
  $actual = $version.Text.Trim()
  if ($actual -ne $ExpectedCliVersion) {
    throw "Expected official DSH CLI $ExpectedCliVersion but found '$actual'."
  }
  Write-Host "Official DSH CLI: $actual"
}

function Ensure-IsolatedProfile {
  $probe = Invoke-Captured $DshCommand @('--profile', $ProfileName, '--dump-config') -AllowFailure
  if ($probe.ExitCode -eq 0) {
    Write-Host "Isolated profile already exists: $ProfileName"
    return
  }

  Write-Host "Creating isolated profile '$ProfileName' from shipped headless template (boot-free dump path)."
  $create = Invoke-Captured $DshCommand @(
    '--profile', $ProfileName,
    '--from-default-profile', 'headless',
    '--dump-config'
  )
  if (-not $create.Text) {
    throw 'Profile initialization returned no composed config.'
  }
}

function New-AcceptanceOverlay {
  param([string]$Path, [string]$BrowserProfile)

  $lines = @(
    '- id: agent-default-model',
    '  config:',
    "    provider: $ExpectedProvider",
    "    model: $ExpectedModel"
  )
  if ($BrowserProfile) {
    $escaped = $BrowserProfile.Replace("'", "''")
    $lines += @(
      '- id: penrix-llm-chatgpt-web',
      '  config:',
      '    headed: true',
      "    profileDir: '$escaped'"
    )
  }
  Set-Content -LiteralPath $Path -Value ($lines -join [Environment]::NewLine) -Encoding utf8
}

function Get-CandidateTarball {
  Invoke-Captured 'npm' @('run', 'build') | Out-Null
  $pack = Invoke-Captured 'npm' @('pack', '--pack-destination', $StageRoot)
  $name = ($pack.Text -split "\r?\n" | Where-Object { $_ -like '*.tgz' } | Select-Object -Last 1)
  if (-not $name) { throw 'npm pack did not report a tarball name.' }
  $path = Join-Path $StageRoot $name.Trim()
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
    throw "Packed candidate missing: $path"
  }
  return [IO.Path]::GetFullPath($path)
}

function Install-Candidate {
  param([string]$Tarball)

  Invoke-Captured $DshCommand @('plugin', '--profile', $ProfileName, 'add', $Tarball) | Out-Null
  $list = Invoke-Captured $DshCommand @(
    'plugin', '--profile', $ProfileName,
    'list', $PackageName, '--depth', '0'
  )
  if ($list.Text -notmatch [regex]::Escape($PackageName)) {
    throw "Profile plugin list does not prove $PackageName is installed."
  }
  Write-Host "Candidate installed in isolated profile: $ProfileName"
}

function Invoke-Inspect {
  Assert-OfficialCli
  Ensure-IsolatedProfile

  $overlay = Join-Path $StageRoot 'official-cli.inspect.patch.yml'
  New-AcceptanceOverlay $overlay ''

  $list = Invoke-Captured $DshCommand @(
    'plugin', '--profile', $ProfileName,
    'list', $PackageName, '--depth', '0'
  )
  if ($list.Text -notmatch [regex]::Escape($PackageName)) {
    throw "Inspect failed: $PackageName is not installed in isolated profile '$ProfileName'. Run -Phase Prepare first."
  }

  $dump = Invoke-Captured $DshCommand @(
    '--profile', $ProfileName,
    '--patch', $overlay,
    '--dump-config'
  )
  if ($dump.Text -notmatch [regex]::Escape($PackageName)) {
    throw "Inspect failed: composed config does not contain $PackageName."
  }
  if ($dump.Text -notmatch 'provider:\s*chatgpt-web') {
    throw 'Inspect failed: composed config does not select provider chatgpt-web.'
  }
  if ($dump.Text -notmatch 'model:\s*chatgpt-web/high') {
    throw 'Inspect failed: composed config does not select model chatgpt-web/high.'
  }

  Write-Host 'OFFICIAL CLI INSPECT: PASS'
  Write-Host "PROFILE: $ProfileName"
  Write-Host "PROVIDER: $ExpectedProvider"
  Write-Host "MODEL: $ExpectedModel"
}

switch ($Phase) {
  'Prepare' {
    Assert-OfficialCli
    Ensure-IsolatedProfile
    $tarball = Get-CandidateTarball
    Install-Candidate $tarball
    Invoke-Inspect
    Write-Host 'OFFICIAL CLI PREPARE: PASS'
    Write-Host "TARBALL: $tarball"
    break
  }

  'Inspect' {
    Invoke-Inspect
    break
  }

  'Live' {
    if (-not $ChatGptProfileDir) {
      throw 'Live requires -ChatGptProfileDir pointing to the existing signed-in ChatGPT browser profile. Refusing to invent or clear it.'
    }
    $ChatGptProfileDir = [IO.Path]::GetFullPath($ChatGptProfileDir)
    if (-not (Test-Path -LiteralPath $ChatGptProfileDir -PathType Container)) {
      throw "Live browser profile does not exist: $ChatGptProfileDir"
    }

    Invoke-Inspect

    $overlay = Join-Path $StageRoot 'official-cli.live.patch.yml'
    New-AcceptanceOverlay $overlay $ChatGptProfileDir

    if (-not $EvidencePath) {
      $EvidencePath = Join-Path $StageRoot ('official-cli-live-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.txt')
    }
    $EvidencePath = [IO.Path]::GetFullPath($EvidencePath)

    Write-Host 'LIVE PHASE: exactly one official headless invocation will now be attempted.'
    Write-Host 'No retry loop is present. Any provider uncertainty remains fail-closed in the plugin.'

    $live = Invoke-Captured $DshCommand @(
      '--profile', $ProfileName,
      '--patch', $overlay,
      $Prompt
    ) -AllowFailure

    @(
      "packet=WEB-OFFICIAL-CLI-001 rev 1",
      "profile=$ProfileName",
      "provider=$ExpectedProvider",
      "model=$ExpectedModel",
      "exitCode=$($live.ExitCode)",
      "completedAt=$((Get-Date).ToUniversalTime().ToString('o'))",
      '',
      $live.Text
    ) | Set-Content -LiteralPath $EvidencePath -Encoding utf8

    Write-Host "EVIDENCE: $EvidencePath"
    if ($live.ExitCode -ne 0) {
      throw "Official CLI live run exited $($live.ExitCode). No automatic retry was attempted."
    }
    Write-Host 'OFFICIAL CLI LIVE: command completed successfully; inspect output/evidence before promoting to LIVE VERIFIED.'
    break
  }
}
