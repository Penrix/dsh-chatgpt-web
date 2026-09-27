import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

const helperUrl = pathToFileURL(resolve('scripts/m2-reasoning-diagnostic.mjs')).href

function run(raw: string) {
  const source = `import { boundedReasoningEnvelopeDiagnostic } from ${JSON.stringify(helperUrl)}\n`
    + `const raw = ${JSON.stringify(raw)}\n`
    + `const out = boundedReasoningEnvelopeDiagnostic(raw, new Error('parser boom'))\n`
    + `process.stdout.write(JSON.stringify(out))\n`
  return spawnSync(process.execPath, ['--input-type=module', '--eval', source], { encoding: 'utf8' })
}

describe('M2 bounded reasoning envelope diagnostic', () => {
  it('preserves bounded metadata and full preview for short responses', () => {
    const raw = '{"ok":true}'
    const result = run(raw)
    expect(result.status).toBe(0)
    const out = JSON.parse(result.stdout) as Record<string, unknown>
    expect(out.rawLength).toBe(raw.length)
    expect(out.sha256).toBe(createHash('sha256').update(raw, 'utf8').digest('hex'))
    expect(out.startsWithBrace).toBe(true)
    expect(out.endsWithBrace).toBe(true)
    expect(out.fenceMarkerCount).toBe(0)
    expect(out.preview).toBe(raw)
    expect((out.parseError as { message: string }).message).toBe('parser boom')
  })

  it('truncates long raw replies to a 1536 head + marker + 512 tail without dumping the middle', () => {
    const raw = '{' + 'A'.repeat(3000) + '```' + 'B'.repeat(3000) + '}'
    const result = run(raw)
    expect(result.status).toBe(0)
    const out = JSON.parse(result.stdout) as { rawLength: number; preview: string; fenceMarkerCount: number }
    expect(out.rawLength).toBe(raw.length)
    expect(out.fenceMarkerCount).toBe(1)
    expect(out.preview.startsWith(raw.slice(0, 1536))).toBe(true)
    expect(out.preview.endsWith(raw.slice(-512))).toBe(true)
    expect(out.preview).toContain(`<truncated ${raw.length - 2048} chars>`)
    expect(out.preview.length).toBeLessThan(raw.length)
  })
})
