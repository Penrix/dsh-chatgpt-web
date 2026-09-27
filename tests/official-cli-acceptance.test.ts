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
