import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const result = spawnSync(npm, ['pack', '--dry-run', '--json'], { encoding: 'utf8' })
if (result.status !== 0) {
  process.stderr.write(result.stderr || result.stdout)
  process.exit(result.status ?? 1)
}

const report = JSON.parse(result.stdout)
assert.equal(Array.isArray(report), true)
assert.equal(report.length, 1)
const files = new Set(report[0].files.map(entry => entry.path))
for (const required of [
  'package.json',
  'lib/index.js',
  'lib/index.d.ts',
  'cordis.patch.yml',
  'README.md',
  'LICENSE',
  'THIRD_PARTY_NOTICES.md',
]) {
  assert.ok(files.has(required), `pack inventory missing ${required}`)
}
for (const path of files) {
  assert.equal(path.startsWith('src/'), false, `source file leaked into candidate pack: ${path}`)
  assert.equal(path.startsWith('tests/'), false, `test file leaked into candidate pack: ${path}`)
}
console.log(`M1 pack smoke: PASS (${files.size} packed files)`) 
