import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const packedPackage = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
assert.equal(
  Object.prototype.hasOwnProperty.call(packedPackage.dependencies ?? {}, 'codex-chatgpt-web'),
  false,
  'embedded transport must not remain a runtime package dependency',
)
const upstreamRuntimeImport = /(?:from\s*|import\s*\(|require\s*\()\s*['"]codex-chatgpt-web(?:\/[^'"]*)?['"]/
for (const builtPath of ['../lib/index.js', '../lib/index.d.ts']) {
  const built = readFileSync(new URL(builtPath, import.meta.url), 'utf8')
  assert.equal(
    upstreamRuntimeImport.test(built),
    false,
    `built artifact still imports codex-chatgpt-web at runtime: ${builtPath}`,
  )
}

const runtimeSource = readFileSync(new URL('../lib/index.js', import.meta.url), 'utf8')
const importSpecifiers = new Set()
for (const pattern of [
  /^\s*import\s+(?:[^'"]*?\s+from\s+)?['"]([^'"]+)['"]/gm,
  /^\s*export\s+[^'"]*?\s+from\s+['"]([^'"]+)['"]/gm,
  /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
]) {
  for (const match of runtimeSource.matchAll(pattern)) importSpecifiers.add(match[1])
}
const packageRoot = (specifier) => specifier.startsWith('@')
  ? specifier.split('/').slice(0, 2).join('/')
  : specifier.split('/')[0]
const declaredRuntimePackages = new Set([
  ...Object.keys(packedPackage.dependencies ?? {}),
  ...Object.keys(packedPackage.peerDependencies ?? {}),
  ...Object.keys(packedPackage.optionalDependencies ?? {}),
])
const undeclaredRuntimePackages = [...importSpecifiers]
  .filter(specifier => !specifier.startsWith('.') && !specifier.startsWith('/') && !specifier.startsWith('node:'))
  .map(packageRoot)
  .filter(packageName => !declaredRuntimePackages.has(packageName))
  .filter((packageName, index, all) => all.indexOf(packageName) === index)
  .sort()
assert.deepEqual(
  undeclaredRuntimePackages,
  [],
  'built plugin has undeclared runtime package imports',
)

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
