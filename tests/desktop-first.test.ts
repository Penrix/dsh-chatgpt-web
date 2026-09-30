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

  it('uses the Desktop-owned bundled CLI for the reserved desktop profile', () => {
    expect(localScript).toContain("'DesktopInstall'")
    expect(localScript).toContain("resources\\runtime\\cli\\bin\\dsh.cmd")
    expect(localScript).toContain("@('plugin','--profile','desktop','add',$resolved.candidate)")
    expect(localScript).not.toContain("dsh @('plugin','--profile','desktop','add'")
  })

  it('refuses Desktop mutation while the real application is still running', () => {
    expect(localScript).toContain('Assert-DesktopStopped')
    const install = localScript.slice(localScript.indexOf("'DesktopInstall'"))
    expect(install.indexOf('Assert-DesktopStopped')).toBeGreaterThan(-1)
    expect(install.indexOf("plugin','--profile','desktop','add")).toBeGreaterThan(
      install.indexOf('Assert-DesktopStopped'),
    )
  })

  it('treats the embedded E2E script as a diagnostic rather than the product acceptance entrypoint', () => {
    expect(packageJson.scripts['m1:diagnostic:e2e-live']).toBe(
      'npm run build && node --experimental-transform-types scripts/m1-embedded-e2e-live.mjs',
    )
  })
})
