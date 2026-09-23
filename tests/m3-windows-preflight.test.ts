import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const scriptUrl = new URL('../scripts/m3-webcodex-windows-preflight.ps1', import.meta.url)

describe('M3 Windows WebCodex preflight', () => {
  it('keeps the protected PAT contents out of the PowerShell preflight', async () => {
    const source = await readFile(scriptUrl, 'utf8')

    expect(source).toContain("Get-Content -LiteralPath $StatePath -Raw")
    expect(source).not.toContain('Get-Content -LiteralPath $userTokenFile')
    expect(source).not.toContain('Get-Content $userTokenFile')
    expect(source).toContain("'--token-file',$userTokenFile")
    expect(source).toContain("'--user-token-file',$userTokenFile")
    expect(source).toContain("secret_contents_read_by_preflight=$false")
    expect(source).toContain("bearerTokenFile=$userTokenFile")
  })

  it('limits live WebCodex CLI calls to read-only status and project observation', async () => {
    const source = await readFile(scriptUrl, 'utf8')

    expect(source).toContain("'server','status'")
    expect(source).toContain("'runner','status'")
    expect(source).toContain("'ops','projects'")
    expect(source).not.toContain("'project','activate'")
    expect(source).not.toContain("'project','register'")
    expect(source).not.toContain("'write_project_file'")
    expect(source).not.toContain("'apply_patch'")
    expect(source).not.toContain("'start_job'")
    expect(source).not.toContain('WEBCODEX_TOKEN')
    expect(source).not.toContain('wc_agent_')
  })

  it('keeps M3 readiness explicitly independent from M1/M2', async () => {
    const source = await readFile(scriptUrl, 'utf8')

    expect(source).toContain('m1_m2_blocked=$false')
    expect(source).toContain('tunnel_required=$false')
    expect(source).toContain('Service + Runner + Project Ready')
  })
})
