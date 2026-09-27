import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'

const npmArgs = ['pack', '--dry-run', '--json']
const npmExecPath = process.env.npm_execpath
const command = npmExecPath
  ? process.execPath
  : process.platform === 'win32'
    ? process.env.ComSpec || 'cmd.exe'
    : 'npm'
const args = npmExecPath
  ? [npmExecPath, ...npmArgs]
  : process.platform === 'win32'
    ? ['/d', '/s', '/c', `npm ${npmArgs.join(' ')}`]
    : npmArgs

const result = spawnSync(command, args, { encoding: 'utf8' })
if (result.error) throw result.error
if (result.status === null) {
  throw new Error(`npm pack terminated without an exit status${result.signal ? ` (signal: ${result.signal})` : ''}`)
}
if (result.status !== 0) {
  const output = result.stderr || result.stdout
  if (output) process.stderr.write(output)
  process.exit(result.status)
}

assert.equal(typeof result.stdout, 'string', 'npm pack produced no stdout')
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
