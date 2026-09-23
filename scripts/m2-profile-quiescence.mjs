import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import process from 'node:process'

function parseArgs(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--profile') out.profile = argv[++i]
    else if (arg === '--timeout-ms') out.timeoutMs = Number(argv[++i])
    else if (arg === '--poll-ms') out.pollMs = Number(argv[++i])
    else throw new Error('Unknown argument: ' + arg)
  }
  return out
}

function sleep(ms) {
  return new Promise(resolveSleep => setTimeout(resolveSleep, ms))
}

function normalizeProcessList(value) {
  if (value === null || value === undefined || value === '') return []
  const parsed = typeof value === 'string' ? JSON.parse(value) : value
  const list = Array.isArray(parsed) ? parsed : [parsed]
  return list.map(item => ({
    pid: Number(item.pid ?? item.ProcessId),
    name: String(item.name ?? item.Name ?? ''),
  })).filter(item => Number.isFinite(item.pid) && item.pid > 0)
}

function createTestLister(sequenceJson) {
  const sequence = JSON.parse(sequenceJson)
  if (!Array.isArray(sequence)) throw new Error('M2_PROFILE_QUIESCENCE_TEST_SEQUENCE must be an array.')
  let index = 0
  return async () => {
    const current = sequence[Math.min(index, sequence.length - 1)] ?? []
    index += 1
    return normalizeProcessList(current)
  }
}

function powershellListProcesses(profile) {
  const lines = [
    "$ErrorActionPreference = 'Stop'",
    "$target = [IO.Path]::GetFullPath($env:M2_PROFILE_QUIESCENCE_TARGET).TrimEnd('\\\\')",
    "$rows = @(",
    "  Get-CimInstance Win32_Process |",
    "    Where-Object { $_.Name -in @('chrome.exe','msedge.exe') -and $_.CommandLine } |",
    "    ForEach-Object {",
    "      $cmd = [string]$_.CommandLine",
    "      $m = [regex]::Match($cmd, '--user-data-dir=(?:\\\"([^\\\"]+)\\\"|([^\\s]+))')",
    "      if (-not $m.Success) { return }",
    "      $raw = if ($m.Groups[1].Success) { $m.Groups[1].Value } else { $m.Groups[2].Value }",
    "      try { $candidate = [IO.Path]::GetFullPath($raw).TrimEnd('\\\\') } catch { return }",
    "      if ([string]::Equals($candidate, $target, [StringComparison]::OrdinalIgnoreCase)) {",
    "        [pscustomobject]@{ pid = [int]$_.ProcessId; name = [string]$_.Name }",
    "      }",
    "    }",
    ")",
    "$rows | ConvertTo-Json -Compress",
  ]
  const script = lines.join('\n')
  const env = { ...process.env, M2_PROFILE_QUIESCENCE_TARGET: profile }
  let lastError
  for (const exe of ['pwsh.exe', 'powershell.exe']) {
    try {
      const stdout = execFileSync(exe, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script], {
        encoding: 'utf8',
        env,
        windowsHide: true,
      })
      return normalizeProcessList(stdout.trim())
    } catch (error) {
      lastError = error
      if (error && typeof error === 'object' && error.code === 'ENOENT') continue
      throw error
    }
  }
  throw lastError ?? new Error('Neither pwsh.exe nor powershell.exe is available.')
}

export async function waitForProfileQuiescence({
  profile,
  timeoutMs = 30_000,
  pollMs = 500,
  listProcesses,
  now = () => Date.now(),
  sleepFn = sleep,
}) {
  const started = now()
  let polls = 0
  let last = []
  for (;;) {
    polls += 1
    last = await listProcesses()
    if (last.length === 0) {
      return { profile, waitedMs: Math.max(0, now() - started), polls, remaining: [] }
    }
    if (now() - started >= timeoutMs) {
      const summary = last.map(item => item.name + ':' + item.pid).join(', ')
      const error = new Error(
        'Timed out waiting for dedicated ChatGPT profile browser processes to exit. '
        + 'profile=' + profile + ' remaining=[' + summary + ']',
      )
      error.code = 'M2_PROFILE_BUSY'
      error.remaining = last
      throw error
    }
    await sleepFn(pollMs)
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const rawProfile = args.profile || process.env.M2_CHATGPT_PROFILE
  if (!rawProfile) throw new Error('Dedicated ChatGPT profile path is required via --profile or M2_CHATGPT_PROFILE.')
  const profile = resolve(rawProfile)
  const timeoutMs = Number.isFinite(args.timeoutMs) ? args.timeoutMs : Number(process.env.M2_PROFILE_QUIESCENCE_TIMEOUT_MS || 30_000)
  const pollMs = Number.isFinite(args.pollMs) ? args.pollMs : Number(process.env.M2_PROFILE_QUIESCENCE_POLL_MS || 500)

  let listProcesses
  if (process.env.M2_PROFILE_QUIESCENCE_TEST_SEQUENCE) {
    listProcesses = createTestLister(process.env.M2_PROFILE_QUIESCENCE_TEST_SEQUENCE)
  } else {
    if (process.platform !== 'win32') {
      throw new Error('Profile quiescence process inspection is Windows-only outside test mode.')
    }
    listProcesses = async () => powershellListProcesses(profile)
  }

  const result = await waitForProfileQuiescence({ profile, timeoutMs, pollMs, listProcesses })
  process.stdout.write(JSON.stringify({
    packet: 'WEB-M2-WIN-LIVE-006 rev 1',
    status: 'quiescent',
    ...result,
  }) + '\n')
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
  main().catch(error => {
    process.stderr.write(JSON.stringify({
      packet: 'WEB-M2-WIN-LIVE-006 rev 1',
      status: 'blocked',
      code: error?.code,
      message: error instanceof Error ? error.message : String(error),
      remaining: error?.remaining,
    }) + '\n')
    process.exitCode = 2
  })
}
