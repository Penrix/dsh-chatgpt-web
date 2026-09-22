[CmdletBinding(SupportsShouldProcess = $true)]
param(
  [ValidateSet('Stage','VerifyStage','InstallIsolated','RollbackIsolated','DesktopInstallPlan','DesktopReadback','DesktopRollbackPlan')]
  [string]$Action = 'Stage',
  [string]$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path,
  [string]$StageRoot,
  [string]$ExpectedBranch = 'web-m1-001-rev2',
  [string]$ExpectedHead,
  [string]$DshHome,
  [string]$DesktopInstallRoot,
  [string]$ExpectedDesktopVersion = '2.0.13',
  [string]$IsolatedDshHome,
  [switch]$SkipRepositoryChecks,
  [switch]$OpenDesktop
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$PackageName = '@penrix/dsh-chatgpt-web'
$MarkerName = '.penrix-m1-stage.json'
$IsolatedMarkerName = '.penrix-m1-isolated.json'

function Invoke-Checked {
  param([Parameter(Mandatory=$true)][string]$FilePath,[Parameter(Mandatory=$true)][string[]]$Arguments,[string]$WorkingDirectory = $RepoRoot)
  Push-Location $WorkingDirectory
  try {
    & $FilePath @Arguments
    if ($LASTEXITCODE -ne 0) { throw "Command failed ($LASTEXITCODE): $FilePath $($Arguments -join ' ')" }
  } finally { Pop-Location }
}

function Get-DefaultDshHome {
  if ($env:DSH_HOME) { return [IO.Path]::GetFullPath($env:DSH_HOME) }
  return [IO.Path]::GetFullPath((Join-Path $HOME '.dsh'))
}

function Get-DefaultDesktopInstallRoot {
  if (-not $env:LOCALAPPDATA) { return $null }
  return [IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'Programs\DSH Desktop'))
}

function Get-DefaultStageRoot {
  return [IO.Path]::GetFullPath((Join-Path $env:TEMP 'dsh-chatgpt-web-m1-stage'))
}

function Resolve-NormalizedPath([string]$Path) {
  return [IO.Path]::GetFullPath($Path).TrimEnd([IO.Path]::DirectorySeparatorChar,[IO.Path]::AltDirectorySeparatorChar)
}

function Write-Utf8NoBom([string]$Path,[string]$Text) {
  $dir = Split-Path -Parent $Path
  if ($dir) { New-Item -ItemType Directory -Force $dir | Out-Null }
  [IO.File]::WriteAllText($Path,$Text,[Text.UTF8Encoding]::new($false))
}

function Write-Json([string]$Path,[object]$Value) {
  Write-Utf8NoBom $Path ($Value | ConvertTo-Json -Depth 12)
}

function Read-Json([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) { throw "Required file not found: $Path" }
  return Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json
}

function Get-Sha256([string]$Path) {
  return (Get-FileHash -Algorithm SHA256 -LiteralPath $Path).Hash.ToLowerInvariant()
}

function Assert-RepositoryTarget {
  if (-not (Test-Path -LiteralPath (Join-Path $RepoRoot '.git'))) {
    # git worktrees use a .git file rather than a directory.
    if (-not (Test-Path -LiteralPath (Join-Path $RepoRoot '.git') -PathType Leaf)) { throw "RepoRoot is not a git checkout/worktree: $RepoRoot" }
  }
  $branch = (& git -C $RepoRoot branch --show-current).Trim()
  if ($LASTEXITCODE -ne 0 -or $branch -ne $ExpectedBranch) { throw "Expected branch '$ExpectedBranch', found '$branch'." }
  $head = (& git -C $RepoRoot rev-parse HEAD).Trim()
  if ($LASTEXITCODE -ne 0 -or -not $head) { throw 'Unable to resolve repository HEAD.' }
  if ($ExpectedHead -and $head -ne $ExpectedHead) { throw "Expected HEAD '$ExpectedHead', found '$head'." }
  $dirty = & git -C $RepoRoot status --porcelain
  if ($LASTEXITCODE -ne 0) { throw 'Unable to read git status.' }
  if ($dirty) { throw 'Repository/worktree is dirty; staging refuses ambiguous source state.' }
  return [pscustomobject]@{ branch = $branch; head = $head }
}

function Assert-PackageShape {
  $manifestPath = Join-Path $RepoRoot 'package.json'
  $manifest = Read-Json $manifestPath
  if ($manifest.name -ne $PackageName) { throw "Unexpected package name '$($manifest.name)'." }
  if ($manifest.main -ne './lib/index.js') { throw "Unexpected runtime entrypoint '$($manifest.main)'." }
  if ($manifest.types -ne './lib/index.d.ts') { throw "Unexpected type entrypoint '$($manifest.types)'." }
  if ($manifest.dsh.bundle.patch -ne './cordis.patch.yml') { throw "Unexpected DSH bundle patch '$($manifest.dsh.bundle.patch)'." }
  return $manifest
}

function Get-DesktopProfileSnapshot {
  param([string]$Destination)
  $profile = Join-Path $DshHome 'profiles\desktop'
  New-Item -ItemType Directory -Force $Destination | Out-Null
  $rows = @()
  foreach ($name in @('package.json','cordis.patch.yml','pnpm-lock.yaml','pnpm-workspace.yaml')) {
    $source = Join-Path $profile $name
    if (Test-Path -LiteralPath $source -PathType Leaf) {
      $target = Join-Path $Destination $name
      Copy-Item -LiteralPath $source -Destination $target -Force
      $rows += [pscustomobject]@{ name=$name; source=$source; backup=$target; sha256=(Get-Sha256 $source) }
    } else {
      $rows += [pscustomobject]@{ name=$name; source=$source; backup=$null; sha256=$null }
    }
  }
  return [pscustomobject]@{ profile=$profile; files=$rows }
}

function Resolve-StageManifest {
  $marker = Join-Path $StageRoot $MarkerName
  $stage = Read-Json $marker
  if ($stage.packageName -ne $PackageName) { throw "Stage marker is for unexpected package '$($stage.packageName)'." }
  $candidate = [IO.Path]::GetFullPath([string]$stage.candidateTarball)
  if (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) { throw "Staged candidate missing: $candidate" }
  $actual = Get-Sha256 $candidate
  if ($actual -ne [string]$stage.candidateSha256) { throw "Staged candidate SHA256 mismatch: expected $($stage.candidateSha256), got $actual" }
  return [pscustomobject]@{ marker=$marker; stage=$stage; candidate=$candidate }
}

function Assert-IsolatedHome([string]$Path) {
  $full = Resolve-NormalizedPath $Path
  $temp = Resolve-NormalizedPath $env:TEMP
  if (-not $full.StartsWith($temp + [IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)) {
    throw "IsolatedDshHome must stay under TEMP by default. Refusing: $full"
  }
  if ($full -eq (Resolve-NormalizedPath $DshHome)) { throw 'IsolatedDshHome must never equal the live DSH_HOME.' }
  return $full
}

function Get-DesktopReadback {
  $profile = Join-Path $DshHome 'profiles\desktop'
  $manifestPath = Join-Path $profile 'package.json'
  $dependency = $null
  $bundleSelected = $false
  if (Test-Path -LiteralPath $manifestPath -PathType Leaf) {
    $manifest = Read-Json $manifestPath
    if ($manifest.dependencies -and $manifest.dependencies.PSObject.Properties.Name -contains $PackageName) {
      $dependency = [string]$manifest.dependencies.$PackageName
    }
    if ($manifest.dsh -and $manifest.dsh.profile -and $manifest.dsh.profile.bundles) {
      $bundleSelected = @($manifest.dsh.profile.bundles) -contains $PackageName
    }
  }
  return [pscustomobject]@{
    profile = $profile
    dependency = $dependency
    bundleSelected = $bundleSelected
    packageJsonSha256 = if (Test-Path -LiteralPath $manifestPath -PathType Leaf) { Get-Sha256 $manifestPath } else { $null }
    readAt = (Get-Date).ToUniversalTime().ToString('o')
  }
}

if (-not $StageRoot) { $StageRoot = Get-DefaultStageRoot }
$StageRoot = [IO.Path]::GetFullPath($StageRoot)
if (-not $DshHome) { $DshHome = Get-DefaultDshHome }
$DshHome = [IO.Path]::GetFullPath($DshHome)
if (-not $DesktopInstallRoot) { $DesktopInstallRoot = Get-DefaultDesktopInstallRoot }
if ($DesktopInstallRoot) { $DesktopInstallRoot = [IO.Path]::GetFullPath($DesktopInstallRoot) }
if (-not $IsolatedDshHome) { $IsolatedDshHome = Join-Path $env:TEMP 'dsh-chatgpt-web-m1-isolated' }

switch ($Action) {
  'Stage' {
    $git = Assert-RepositoryTarget
    $manifest = Assert-PackageShape
    if (-not $SkipRepositoryChecks) {
      Invoke-Checked npm @('install','--no-audit','--no-fund','--package-lock=false')
      Invoke-Checked npm @('run','typecheck')
      Invoke-Checked npm @('test')
      Invoke-Checked npm @('run','build')
      Invoke-Checked npm @('run','smoke:load')
      Invoke-Checked npm @('run','smoke:pack')
    } else {
      if (-not (Test-Path -LiteralPath (Join-Path $RepoRoot 'lib\index.js') -PathType Leaf)) { throw '-SkipRepositoryChecks requires an existing built lib/index.js.' }
    }

    if (Test-Path -LiteralPath $StageRoot) {
      $existingMarker = Join-Path $StageRoot $MarkerName
      if (-not (Test-Path -LiteralPath $existingMarker -PathType Leaf)) { throw "Refusing to replace unowned staging directory: $StageRoot" }
      $existingStage = Read-Json $existingMarker
      if ($existingStage.packageName -ne $PackageName) { throw "Refusing to replace staging directory owned by '$($existingStage.packageName)'." }
      Remove-Item -LiteralPath $StageRoot -Recurse -Force
    }
    New-Item -ItemType Directory -Force $StageRoot | Out-Null
    $packJson = & npm pack --json --pack-destination $StageRoot
    if ($LASTEXITCODE -ne 0) { throw "npm pack failed with exit code $LASTEXITCODE." }
    $pack = ($packJson | Out-String | ConvertFrom-Json)[0]
    $candidate = [IO.Path]::GetFullPath((Join-Path $StageRoot $pack.filename))
    if (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) { throw "npm pack did not create expected tarball: $candidate" }

    $unpacked = Join-Path $StageRoot 'unpacked'
    New-Item -ItemType Directory -Force $unpacked | Out-Null
    Invoke-Checked tar @('-xf',$candidate,'-C',$unpacked) $RepoRoot
    foreach ($required in @('package\package.json','package\lib\index.js','package\lib\index.d.ts','package\cordis.patch.yml')) {
      if (-not (Test-Path -LiteralPath (Join-Path $unpacked $required) -PathType Leaf)) { throw "Staged package missing $required" }
    }
    $packedManifest = Read-Json (Join-Path $unpacked 'package\package.json')
    if ($packedManifest.name -ne $PackageName) { throw "Packed package name mismatch: $($packedManifest.name)" }

    $desktopBefore = Get-DesktopProfileSnapshot (Join-Path $StageRoot 'desktop-before')
    $desktopExe = if ($DesktopInstallRoot) { Join-Path $DesktopInstallRoot 'DSH Desktop.exe' } else { $null }
    $stage = [pscustomobject]@{
      schema = 1
      packet = 'WEB-M1-LOCAL-002 rev 1'
      packageName = $PackageName
      packageVersion = [string]$manifest.version
      branch = $git.branch
      head = $git.head
      candidateTarball = $candidate
      candidateSha256 = Get-Sha256 $candidate
      stageRoot = $StageRoot
      repoRoot = $RepoRoot
      dshHome = $DshHome
      desktopInstallRoot = $DesktopInstallRoot
      desktopExe = $desktopExe
      desktopExeExists = [bool]($desktopExe -and (Test-Path -LiteralPath $desktopExe -PathType Leaf))
      desktopBefore = $desktopBefore
      repositoryChecksSkipped = [bool]$SkipRepositoryChecks
      stagedAt = (Get-Date).ToUniversalTime().ToString('o')
    }
    Write-Json (Join-Path $StageRoot $MarkerName) $stage
    Write-Host "STAGED: $candidate"
    Write-Host "SHA256: $($stage.candidateSha256)"
    Write-Host "NEXT (non-destructive Desktop plan): .\scripts\m1-local.ps1 -Action DesktopInstallPlan -StageRoot `"$StageRoot`""
  }

  'VerifyStage' {
    $resolved = Resolve-StageManifest
    Write-Host "VERIFIED: $($resolved.candidate)"
    Write-Host "SHA256: $($resolved.stage.candidateSha256)"
  }

  'InstallIsolated' {
    $resolved = Resolve-StageManifest
    $isolated = Assert-IsolatedHome $IsolatedDshHome
    if (Test-Path -LiteralPath $isolated) {
      $marker = Join-Path $isolated $IsolatedMarkerName
      if (-not (Test-Path -LiteralPath $marker -PathType Leaf)) { throw "Refusing to mutate unowned isolated home: $isolated" }
    } else { New-Item -ItemType Directory -Force $isolated | Out-Null }
    if (-not $PSCmdlet.ShouldProcess($isolated,"install staged $PackageName into isolated DSH web profile")) {
      Write-Host "WHATIF: would install $($resolved.candidate) into isolated DSH_HOME $isolated"
      break
    }
    Write-Json (Join-Path $isolated $IsolatedMarkerName) ([pscustomobject]@{ packageName=$PackageName; stageMarker=$resolved.marker; candidateSha256=$resolved.stage.candidateSha256; createdAt=(Get-Date).ToUniversalTime().ToString('o') })
    $oldHome = $env:DSH_HOME
    try {
      $env:DSH_HOME = $isolated
      Invoke-Checked dsh @('plugin','--profile','web','add',$resolved.candidate) $RepoRoot
      $effective = Join-Path $StageRoot 'isolated-effective-config.txt'
      Push-Location $RepoRoot
      try {
        $config = & dsh --profile web --dump-default-config 2>&1
        if ($LASTEXITCODE -ne 0) { throw "DSH isolated config readback failed: $($config -join [Environment]::NewLine)" }
        Write-Utf8NoBom $effective (($config -join [Environment]::NewLine) + [Environment]::NewLine)
      } finally { Pop-Location }
      Write-Json (Join-Path $StageRoot 'isolated-install-readback.json') ([pscustomobject]@{ dshHome=$isolated; candidate=$resolved.candidate; candidateSha256=$resolved.stage.candidateSha256; effectiveConfig=$effective; completedAt=(Get-Date).ToUniversalTime().ToString('o') })
      Write-Host "ISOLATED INSTALL COMPLETE: $isolated"
    } finally {
      if ($null -eq $oldHome) { Remove-Item Env:DSH_HOME -ErrorAction SilentlyContinue } else { $env:DSH_HOME = $oldHome }
    }
  }

  'RollbackIsolated' {
    $isolated = Assert-IsolatedHome $IsolatedDshHome
    $marker = Join-Path $isolated $IsolatedMarkerName
    if (-not (Test-Path -LiteralPath $marker -PathType Leaf)) { throw "Refusing rollback: owned marker missing at $marker" }
    $owned = Read-Json $marker
    if ($owned.packageName -ne $PackageName) { throw 'Refusing rollback: marker package mismatch.' }
    if ($PSCmdlet.ShouldProcess($isolated,'remove isolated DSH_HOME created by M1 tooling')) {
      Remove-Item -LiteralPath $isolated -Recurse -Force
      Write-Host "ROLLED BACK ISOLATED HOME: $isolated"
    }
  }

  'DesktopInstallPlan' {
    $resolved = Resolve-StageManifest
    if (-not $DesktopInstallRoot -or -not (Test-Path -LiteralPath $DesktopInstallRoot -PathType Container)) { throw "DSH Desktop install root not found: $DesktopInstallRoot" }
    $desktopExe = Join-Path $DesktopInstallRoot 'DSH Desktop.exe'
    if (-not (Test-Path -LiteralPath $desktopExe -PathType Leaf)) { throw "DSH Desktop executable not found: $desktopExe" }
    $desktopVersionInfo = (Get-Item -LiteralPath $desktopExe).VersionInfo
    $observedDesktopVersion = @($desktopVersionInfo.ProductVersion,$desktopVersionInfo.FileVersion) |
      Where-Object { $_ } |
      Select-Object -First 1
    if (-not $observedDesktopVersion -or -not $observedDesktopVersion.StartsWith($ExpectedDesktopVersion,[StringComparison]::OrdinalIgnoreCase)) {
      throw "Expected DSH Desktop $ExpectedDesktopVersion, observed '$observedDesktopVersion' at $desktopExe."
    }
    $before = Get-DesktopProfileSnapshot (Join-Path $StageRoot 'desktop-before-install')
    $plan = [pscustomobject]@{
      packageName=$PackageName
      candidate=$resolved.candidate
      candidateSha256=$resolved.stage.candidateSha256
      desktopExe=$desktopExe
      expectedDesktopVersion=$ExpectedDesktopVersion
      desktopVersion=$observedDesktopVersion
      dshHome=$DshHome
      desktopProfile=$before.profile
      backup=$before
      mutation='Use DSH Desktop Plugins > Add plugin with candidate absolute tarball path; do not edit profile files.'
      rollback='Use DSH Desktop Plugins to remove/disable the bundle. If startup is fatal, use Desktop native recovery to disable third-party bundles.'
      preparedAt=(Get-Date).ToUniversalTime().ToString('o')
    }
    $planPath = Join-Path $StageRoot 'desktop-install-plan.json'
    Write-Json $planPath $plan
    Write-Host "DESKTOP INSTALL PLAN: $planPath"
    Write-Host "PLUGIN SPEC: $($resolved.candidate)"
    Write-Host 'Codex must use the DSH Desktop Plugins page for the actual install; this script does not mutate the reserved desktop profile.'
    if ($OpenDesktop) { Start-Process -FilePath $desktopExe | Out-Null }
  }

  'DesktopReadback' {
    $resolved = Resolve-StageManifest
    $state = Get-DesktopReadback
    $report = [pscustomobject]@{ expectedPackage=$PackageName; candidate=$resolved.candidate; candidateSha256=$resolved.stage.candidateSha256; state=$state }
    $path = Join-Path $StageRoot 'desktop-readback.json'
    Write-Json $path $report
    Write-Host "DESKTOP READBACK: $path"
    Write-Host "dependency=$($state.dependency) bundleSelected=$($state.bundleSelected)"
  }

  'DesktopRollbackPlan' {
    $resolved = Resolve-StageManifest
    $state = Get-DesktopReadback
    $plan = [pscustomobject]@{
      packageName=$PackageName
      candidateSha256=$resolved.stage.candidateSha256
      currentState=$state
      normalRollback='DSH Desktop > Plugins: disable/remove @penrix/dsh-chatgpt-web, then restart if requested.'
      fatalRollback='Use DSH Desktop native fatal recovery: disable third-party bundles; do not restore backup files by hand.'
      forensicBackup=(Join-Path $StageRoot 'desktop-before-install')
      preparedAt=(Get-Date).ToUniversalTime().ToString('o')
    }
    $path = Join-Path $StageRoot 'desktop-rollback-plan.json'
    Write-Json $path $plan
    Write-Host "DESKTOP ROLLBACK PLAN: $path"
    Write-Host 'This action is read-only. Codex must perform removal through the Desktop Plugins page or native recovery.'
  }
}
