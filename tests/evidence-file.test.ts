import { afterEach, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

it('refuses to replace evidence reserved by an earlier run', () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-evidence-test-'))
  roots.push(root)
  const path = join(root, 'evidence.json')
  const source = `import { reserveEvidenceFile } from ${JSON.stringify(pathToFileURL(resolve('scripts/evidence-file.mjs')).href)}; reserveEvidenceFile(${JSON.stringify(path)});`
  const first = spawnSync(process.execPath, ['--input-type=module', '--eval', source], { encoding: 'utf8' })
  expect(first.status, first.stderr).toBe(0)
  const original = readFileSync(path, 'utf8')
  const second = spawnSync(process.execPath, ['--input-type=module', '--eval', source], { encoding: 'utf8' })
  expect(second.status).not.toBe(0)
  expect(second.stderr).toContain('EEXIST')
  expect(readFileSync(path, 'utf8')).toBe(original)
})
