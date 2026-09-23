[CmdletBinding()]
param(
  [string]$StatePath,
  [string]$ExpectedProjectPath,
  [string]$WebCodexCli,
  [switch]$Json
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$Packet = 'WEB-M3-WIN-BOOT-002 rev 1'

function Get-JsonProperty {
  param([object]$Object,[string]$Name)
  if ($null -eq $Object) { return $null }
  $property = $Object.PSObject.Properties[$Name]
  if ($null -eq $property) { return $null }
  return $property.Value
}

function Resolve-FullPath {
  param([string]$Path)
  if (-not $Path) { return $null }
  return [IO.Path]::GetFullPath($Path).TrimEnd([IO.Path]::DirectorySeparatorChar,[IO.Path]::AltDirectorySeparatorChar)
}

function Test-SameWindowsPath {
  param([string]$Left,[string]$Right)
  if (-not $Left -or -not $Right) { return $false }
  try {
    return (Resolve-FullPath $Left).Equals((Resolve-FullPath $Right),[StringComparison]::OrdinalIgnoreCase)
  } catch {
    $leftTrimmed = $Left.TrimEnd([IO.Path]::DirectorySeparatorChar,[IO.Path]::AltDirectorySeparatorChar)
    $rightTrimmed = $Right.TrimEnd([IO.Path]::DirectorySeparatorChar,[IO.Path]::AltDirectorySeparatorChar)
    return $leftTrimmed.Equals($rightTrimmed,[StringComparison]::OrdinalIgnoreCase)
  }
}

function Resolve-WebCodexCli {
  if ($WebCodexCli) {
    $candidate = Resolve-FullPath $WebCodexCli
    if (Test-Path -LiteralPath $candidate -PathType Leaf) { return $candidate }
    return $null
  }

  $command = Get-Command webcodex -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($command -and $command.Source) { return $command.Source }

  # Current Desktop uses mainBinaryName=WebCodex and bundles the runtime under
  # resource_dir\webcodex-runtime. This is observation only: use the candidate
  # only when it actually exists; never infer readiness from the process alone.
  $desktop = Get-Process -Name WebCodex -ErrorAction SilentlyContinue |
    Where-Object { $_.Path } |
    Select-Object -First 1
  if ($desktop -and $desktop.Path) {
    $candidate = Join-Path (Split-Path -Parent $desktop.Path) 'webcodex-runtime\webcodex.exe'
    if (Test-Path -LiteralPath $candidate -PathType Leaf) { return $candidate }
  }

  return $null
}

function Invoke-WebCodexJson {
  param([string]$Cli,[string[]]$Arguments)
  # Do not surface raw stdout/stderr. The three commands used below are official
  # read-only status/ops calls; only selected non-secret fields are projected.
  $rawLines = @(& $Cli @Arguments 2>$null)
  $exitCode = $LASTEXITCODE
  if ($exitCode -ne 0) {
    return [pscustomobject]@{ ok=$false; exit_code=$exitCode; value=$null }
  }
  try {
    $value = (($rawLines -join [Environment]::NewLine) | ConvertFrom-Json)
    return [pscustomobject]@{ ok=$true; exit_code=0; value=$value }
  } catch {
    return [pscustomobject]@{ ok=$false; exit_code=0; value=$null }
  }
}

function Finish-Report {
  param([object]$Report,[int]$ExitCode)
  if ($Json) {
    $Report | ConvertTo-Json -Depth 12
  } else {
    $Report
  }
  exit $ExitCode
}

if ($env:OS -ne 'Windows_NT') {
  Finish-Report ([ordered]@{
    schema=1
    packet=$Packet
    ready=$false
    blocker='windows_required'
    next_action='Run this preflight on the target Windows machine.'
  }) 2
}

if (-not $StatePath) {
  if (-not $env:LOCALAPPDATA) {
    Finish-Report ([ordered]@{
      schema=1
      packet=$Packet
      ready=$false
      blocker='localappdata_unavailable'
      next_action='Launch WebCodex Desktop under the target Windows user, then retry.'
    }) 2
  }
  $StatePath = Join-Path $env:LOCALAPPDATA 'dev.webcodex.desktop\desktop-state.json'
}
$StatePath = Resolve-FullPath $StatePath

if (-not (Test-Path -LiteralPath $StatePath -PathType Leaf)) {
  Finish-Report ([ordered]@{
    schema=1
    packet=$Packet
    ready=$false
    state_path=$StatePath
    blocker='desktop_state_missing'
    next_action='Install/launch WebCodex Desktop, choose Local Full Runtime / 在此电脑使用 WebCodex, select the exact harmless repository, and wait for Service + Runner + Project Ready.'
    m1_m2_blocked=$false
  }) 2
}

try {
  $state = Get-Content -LiteralPath $StatePath -Raw | ConvertFrom-Json
} catch {
  Finish-Report ([ordered]@{
    schema=1
    packet=$Packet
    ready=$false
    state_path=$StatePath
    blocker='desktop_state_invalid'
    next_action='Open WebCodex Desktop and repair/re-run Local Full Runtime setup; do not hand-edit desktop-state.json.'
    m1_m2_blocked=$false
  }) 2
}

$topology = Get-JsonProperty $state 'topology'
$topologyServer = Get-JsonProperty $topology 'server'
$topologyRunner = Get-JsonProperty $topology 'runner'
$runtime = Get-JsonProperty $state 'runtime'
$project = Get-JsonProperty $state 'project'

$experience = [string](Get-JsonProperty $topology 'experience')
$serverKind = [string](Get-JsonProperty $topologyServer 'kind')
$runnerKind = [string](Get-JsonProperty $topologyRunner 'kind')
$serverUrl = [string](Get-JsonProperty $runtime 'server_url')
$runnerConfig = [string](Get-JsonProperty $runtime 'runner_config')
$userTokenFile = [string](Get-JsonProperty $runtime 'user_token_file')
$runtimeProjectId = [string](Get-JsonProperty $runtime 'runtime_project_id')
$storedProjectId = [string](Get-JsonProperty $runtime 'project_id')
$projectPath = [string](Get-JsonProperty $project 'path')
$projectRuntimeId = [string](Get-JsonProperty $project 'runtime_project_id')

$configComplete = $experience -eq 'full' -and
  $serverKind -eq 'local' -and
  $runnerKind -eq 'local' -and
  -not [string]::IsNullOrWhiteSpace($serverUrl) -and
  -not [string]::IsNullOrWhiteSpace($runnerConfig) -and
  -not [string]::IsNullOrWhiteSpace($userTokenFile) -and
  -not [string]::IsNullOrWhiteSpace($runtimeProjectId) -and
  -not [string]::IsNullOrWhiteSpace($projectPath)

$expectedMatches = if ($ExpectedProjectPath) {
  Test-SameWindowsPath $projectPath $ExpectedProjectPath
} else {
  $true
}
$runtimeIdentityMatches = -not [string]::IsNullOrWhiteSpace($projectRuntimeId) -and
  $runtimeProjectId -eq $projectRuntimeId
$tokenFileExists = -not [string]::IsNullOrWhiteSpace($userTokenFile) -and
  (Test-Path -LiteralPath $userTokenFile -PathType Leaf)
$runnerConfigExists = -not [string]::IsNullOrWhiteSpace($runnerConfig) -and
  (Test-Path -LiteralPath $runnerConfig -PathType Leaf)

$loopbackBaseUrl = $false
try {
  $uri = [Uri]$serverUrl
  $loopbackBaseUrl = $uri.IsAbsoluteUri -and
    ($uri.Scheme -eq 'http' -or $uri.Scheme -eq 'https') -and
    $uri.IsLoopback
} catch {
  $loopbackBaseUrl = $false
}

if (-not $configComplete) {
  Finish-Report ([ordered]@{
    schema=1
    packet=$Packet
    ready=$false
    state_path=$StatePath
    local_full_runtime_configured=$false
    project_path=if ($projectPath) { $projectPath } else { $null }
    blocker='local_full_runtime_not_configured'
    next_action='In WebCodex Desktop choose Local Full Runtime / 在此电脑使用 WebCodex, select the exact harmless repository, click 配置 WebCodex, and wait for Service + Runner + Project Ready.'
    m1_m2_blocked=$false
  }) 2
}

if (-not $expectedMatches) {
  Finish-Report ([ordered]@{
    schema=1
    packet=$Packet
    ready=$false
    state_path=$StatePath
    project_path=$projectPath
    expected_project_path=$ExpectedProjectPath
    blocker='unexpected_project'
    next_action='Use WebCodex Desktop Project to activate the exact intended harmless repository; do not widen allowed roots.'
    m1_m2_blocked=$false
  }) 2
}

if (-not $runtimeIdentityMatches -or -not $tokenFileExists -or -not $runnerConfigExists -or -not $loopbackBaseUrl) {
  $blocker = if (-not $runtimeIdentityMatches) {
    'runtime_project_identity_mismatch'
  } elseif (-not $tokenFileExists) {
    'managed_user_pat_file_missing'
  } elseif (-not $runnerConfigExists) {
    'runner_config_missing'
  } else {
    'local_server_url_not_loopback'
  }
  Finish-Report ([ordered]@{
    schema=1
    packet=$Packet
    ready=$false
    state_path=$StatePath
    project_path=$projectPath
    base_url=$serverUrl
    runtime_project_id=$runtimeProjectId
    local_project_id=if ($storedProjectId) { $storedProjectId } else { $null }
    credential=[ordered]@{
      type='managed_user_pat'
      file=$userTokenFile
      file_exists=[bool]$tokenFileExists
      required_scope='project:read'
      secret_contents_read_by_preflight=$false
    }
    blocker=$blocker
    next_action='Return to WebCodex Desktop and repair/re-run the same Local Full Runtime project setup. Do not substitute the Server bootstrap token or Runner token.'
    m1_m2_blocked=$false
  }) 2
}

$cli = Resolve-WebCodexCli
$baseReport = [ordered]@{
  schema=1
  packet=$Packet
  state_path=$StatePath
  local_full_runtime_configured=$true
  project_path=$projectPath
  base_url=$serverUrl
  runtime_project_id=$runtimeProjectId
  local_project_id=if ($storedProjectId) { $storedProjectId } else { $null }
  runner_config=$runnerConfig
  credential=[ordered]@{
    type='managed_user_pat'
    file=$userTokenFile
    file_exists=$true
    required_scope='project:read'
    secret_contents_read_by_preflight=$false
    handoff='Pass the protected file path to the M3 seam as bearerTokenFile; never print the file contents.'
  }
  dsh_webcodex_read=[ordered]@{
    baseUrl=$serverUrl
    bearerTokenFile=$userTokenFile
    project=$runtimeProjectId
  }
  tunnel_required=$false
  m1_m2_blocked=$false
}

if (-not $cli) {
  $baseReport['ready']=$false
  $baseReport['live_checks']=[ordered]@{
    checked=$false
    webcodex_cli=$null
    service_ready=$null
    runner_ready=$null
    project_ready=$null
  }
  $baseReport['blocker']='webcodex_cli_unresolved_for_live_check'
  $baseReport['next_action']='Keep Service/Runner/Project visibly Ready in WebCodex Desktop, then rerun with -WebCodexCli pointing to the official bundled webcodex.exe (or put webcodex on PATH). No Tunnel is required.'
  Finish-Report $baseReport 3
}

$serverStatus = Invoke-WebCodexJson $cli @(
  'server','status',
  '--url',$serverUrl,
  '--token-file',$userTokenFile,
  '--no-system-proxy',
  '--json'
)
$runnerStatus = Invoke-WebCodexJson $cli @(
  'runner','status',
  '--config',$runnerConfig,
  '--server-url',$serverUrl,
  '--user-token-file',$userTokenFile,
  '--no-system-proxy',
  '--json'
)
$projectsStatus = Invoke-WebCodexJson $cli @(
  'ops','projects',
  '--server-url',$serverUrl,
  '--token-file',$userTokenFile,
  '--no-system-proxy',
  '--json'
)

$serviceReady = $serverStatus.ok -and (Get-JsonProperty $serverStatus.value 'http_reachable') -eq $true
$runnerRuntime = Get-JsonProperty $runnerStatus.value 'runtime'
$runnerReady = $runnerStatus.ok -and
  (Get-JsonProperty $runnerRuntime 'checked') -eq $true -and
  (Get-JsonProperty $runnerRuntime 'reachable') -eq $true -and
  (Get-JsonProperty $runnerRuntime 'client_online') -eq $true

$projectReady = $false
if ($projectsStatus.ok) {
  $summary = Get-JsonProperty $projectsStatus.value 'summary'
  $projects = @(Get-JsonProperty $summary 'projects')
  foreach ($candidate in $projects) {
    if ([string](Get-JsonProperty $candidate 'id') -eq $runtimeProjectId -and
        (Test-SameWindowsPath ([string](Get-JsonProperty $candidate 'path')) $projectPath) -and
        (Get-JsonProperty $candidate 'connected') -eq $true -and
        [string](Get-JsonProperty $candidate 'agent_status') -eq 'online') {
      $projectReady = $true
      break
    }
  }
}

$ready = [bool]($serviceReady -and $runnerReady -and $projectReady)
$baseReport['ready']=$ready
$baseReport['live_checks']=[ordered]@{
  checked=$true
  webcodex_cli=$cli
  service_ready=[bool]$serviceReady
  runner_ready=[bool]$runnerReady
  project_ready=[bool]$projectReady
}
if ($ready) {
  $baseReport['blocker']=$null
  $baseReport['next_action']='Configure only M3 webcodexRead with the emitted baseUrl, bearerTokenFile, and runtime Project id, then run the bounded DSH webcodex_read_files acceptance read.'
  Finish-Report $baseReport 0
}

$baseReport['blocker']=if (-not $serverStatus.ok) {
  'service_status_failed'
} elseif (-not $serviceReady) {
  'service_not_ready'
} elseif (-not $runnerStatus.ok) {
  'runner_status_failed'
} elseif (-not $runnerReady) {
  'runner_not_ready'
} elseif (-not $projectsStatus.ok) {
  'projects_status_failed'
} else {
  'project_not_ready'
}
$baseReport['next_action']='Use WebCodex Desktop diagnostics to restore the same Service / Runner / exact Project to Ready, then rerun this read-only preflight. Do not start a Tunnel and do not modify M1/M2.'
Finish-Report $baseReport 4
