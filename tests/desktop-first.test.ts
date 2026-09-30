import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { Config } from '../src/index.ts'

const localScript = readFileSync(new URL('../scripts/m1-local.ps1', import.meta.url), 'utf8')
const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))

describe('Desktop-first M1 product path', () => {
  it('disables interactive ChatGPT login in the real plugin configuration by default', () => {
    const config = Config({})
    expect(config.allowInteractiveLogin).toBe(false)
  })

  it('does not impose an absolute ChatGPT Web turn timeout by default', () => {
    const config = Config({})
    expect(config.turnTimeoutMs).toBeUndefined()
  })

  it('does not duplicate the upstream model-specific composer limit by default', () => {
    const config = Config({})
    expect(config.composerMaxChars).toBeUndefined()
  })

  it('does not override model-specific context windows by default', () => {
    const config = Config({})
    expect(config.contextWindow).toBeUndefined()
  })

  it('does not claim a Web output-token cap that the browser cannot enforce', () => {
    const config = Config({})
    expect(config.maxTokens).toBeUndefined()
  })

  it('uses the official Desktop Plugins UI as the primary install boundary', () => {
    expect(localScript).toContain("'DesktopUiInstallPlan'")
    expect(localScript).toContain('Plugins -> Add plugin')
    expect(localScript).toContain('Enable now')
    expect(localScript).not.toContain("'DesktopInstall'")
    expect(localScript).not.toContain("@('plugin','--profile','desktop','add',$resolved.candidate)")
  })

  it('accepts an exact detached HEAD without dereferencing an empty branch name', () => {
    expect(localScript).not.toContain("branch --show-current).Trim()")
    expect(localScript).toContain("$branchOutput = & git -C $RepoRoot branch --show-current")
  })

  it('keeps Desktop profile mutation inside the official running Plugins UI', () => {
    expect(localScript).not.toContain('Assert-DesktopStopped')
    expect(localScript).not.toContain('Get-DesktopManagedCli')
    expect(localScript).toContain('desktop-ui-install-plan.json')
    expect(localScript).toContain('Plugins -> Add plugin')
  })

  it('treats the embedded E2E script as a diagnostic rather than the product acceptance entrypoint', () => {
    expect(packageJson.scripts['m1:diagnostic:e2e-live']).toBe(
      'npm run build && node --experimental-transform-types scripts/m1-embedded-e2e-live.mjs',
    )
  })
})
