import { spawnSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const scriptPath = resolve('scripts/official-cli-acceptance.ps1')
const script = await readFile(scriptPath, 'utf8')

describe('official CLI acceptance harness contract', () => {
  it('keeps Prepare/Inspect offline from ChatGPT and Live explicit', () => {
    expect(script).toContain("[ValidateSet('Prepare','Inspect','Live')]")
    expect(script).toContain("[string]$Phase = 'Inspect'")
    expect(script).toContain("'Live' {")
    expect(script).toContain("Live requires -ChatGptProfileDir")
  })

  it('pins the official CLI and isolated profile contract', () => {
    expect(script).toContain("$ExpectedCliVersion = '0.1.7-rc.2'")
    expect(script).toContain("$ProfileName = 'penrix-chatgpt-web-headless'")
    expect(script).toContain("Refusing to mutate the shipped headless profile")
    expect(script).toContain("'--from-default-profile', 'headless'")
    expect(script).toContain("'--dump-config'")
  })

  it('proves plugin/provider/model before Live', () => {
    expect(script).toContain("$PackageName = '@penrix/dsh-chatgpt-web'")
    expect(script).toContain("'plugin', '--profile', $ProfileName")
    expect(script).toContain("provider: $ExpectedProvider")
    expect(script).toContain("model: $ExpectedModel")
    expect(script).toContain("$ExpectedProvider = 'chatgpt-web'")
    expect(script).toContain("$ExpectedModel = 'chatgpt-web/high'")
    const liveIndex = script.indexOf("'Live' {")
    const inspectInLive = script.indexOf('Invoke-Inspect', liveIndex)
    const liveInvocation = script.indexOf("'--profile', $ProfileName", inspectInLive)
    expect(inspectInLive).toBeGreaterThan(liveIndex)
    expect(liveInvocation).toBeGreaterThan(inspectInLive)
  })

  it('has no automatic live retry and records one invocation outcome', () => {
    expect(script).toContain('exactly one official headless invocation')
    expect(script).toContain('No retry loop is present')
    expect(script).toContain('No automatic retry was attempted')
    const liveBlock = script.slice(script.indexOf("'Live' {"))
    expect(liveBlock.match(/\$live\s*=\s*Invoke-Captured/g)).toHaveLength(1)
  })
})


describe.skipIf(process.platform !== 'win32')('Invoke-Captured on Windows PowerShell', () => {
  it('returns native stderr/nonzero with -AllowFailure and throws without it', () => {
    const command = [
      "$ErrorActionPreference = 'Stop'",
      "$scriptPath = (Resolve-Path 'scripts/official-cli-acceptance.ps1').Path",
      "$tokens = $null; $errors = $null",
      "$ast = [System.Management.Automation.Language.Parser]::ParseFile($scriptPath, [ref]$tokens, [ref]$errors)",
      "if ($errors.Count -ne 0) { throw ($errors | Out-String) }",
      "$fn = $ast.Find({ param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq 'Invoke-Captured' }, $true)",
      "if (-not $fn) { throw 'Invoke-Captured function not found' }",
      "Invoke-Expression $fn.Extent.Text",
      "$RepoRoot = (Get-Location).Path",
      "$before = $ErrorActionPreference",
      "$allowed = Invoke-Captured $env:ComSpec @('/d','/s','/c','echo expected-stderr 1>&2 & exit /b 7') -AllowFailure",
      "if ($allowed.ExitCode -ne 7) { throw ('expected exit 7, got ' + $allowed.ExitCode) }",
      "if ($allowed.Text -notmatch 'expected-stderr') { throw 'stderr was not captured' }",
      "if ($ErrorActionPreference -ne $before) { throw 'ErrorActionPreference was not restored after allowed failure' }",
      "$threw = $false",
      "try { Invoke-Captured $env:ComSpec @('/d','/s','/c','echo expected-stderr 1>&2 & exit /b 7') | Out-Null } catch { $threw = $true }",
      "if (-not $threw) { throw 'non-allowed native failure did not throw' }",
      "if ($ErrorActionPreference -ne $before) { throw 'ErrorActionPreference was not restored after throwing failure' }",
      "Write-Output 'CAPTURE_REGRESSION_PASS'",
    ].join('; ')

    const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], {
      cwd: resolve('.'),
      encoding: 'utf8',
    })

    expect(result.status, result.stderr || result.stdout).toBe(0)
    expect(result.stdout).toContain('CAPTURE_REGRESSION_PASS')
  })
})
