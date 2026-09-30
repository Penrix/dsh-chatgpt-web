import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const root = fileURLToPath(new URL('..', import.meta.url))
const temp = mkdtempSync(join(tmpdir(), 'dsh-chatgpt-web-packed-install-'))
const installRoot = join(temp, 'consumer')
const packRoot = join(temp, 'pack')
const npmExecPath = process.env.npm_execpath

function npm(args, cwd) {
  const command = npmExecPath
    ? process.execPath
    : process.platform === 'win32'
      ? process.env.ComSpec || 'cmd.exe'
      : 'npm'
  const commandArgs = npmExecPath
    ? [npmExecPath, ...args]
    : process.platform === 'win32'
      ? ['/d', '/s', '/c', `npm ${args.map(arg => JSON.stringify(arg)).join(' ')}`]
      : args
  const result = spawnSync(command, commandArgs, { cwd, encoding: 'utf8' })
  if (result.error) throw result.error
  if (result.status !== 0) {
    if (result.stdout) process.stderr.write(result.stdout)
    if (result.stderr) process.stderr.write(result.stderr)
    throw new Error(`npm ${args[0]} failed with status ${result.status}`)
  }
  return result.stdout
}

try {
  writeFileSync(join(temp, 'package.json'), JSON.stringify({ private: true, type: 'module' }))
  writeFileSync(join(temp, '.npmrc'), 'fund=false\naudit=false\n')
  await import('node:fs/promises').then(({ mkdir }) => Promise.all([
    mkdir(installRoot, { recursive: true }),
    mkdir(packRoot, { recursive: true }),
  ]))
  writeFileSync(join(installRoot, 'package.json'), JSON.stringify({ private: true, type: 'module' }))

  const packed = JSON.parse(npm(['pack', '--json', '--pack-destination', packRoot], root))
  assert.equal(packed.length, 1)
  const tarball = join(packRoot, packed[0].filename)

  npm(['install', '--omit=dev', '--no-audit', '--no-fund', tarball], installRoot)

  assert.equal(
    existsSync(join(installRoot, 'node_modules', 'codex-chatgpt-web')),
    false,
    'packed consumer unexpectedly installed build-only codex-chatgpt-web',
  )

  const installedTree = JSON.parse(npm(['ls', '--all', '--json'], installRoot))
  const installedNames = new Set()
  const visitDependencies = dependencies => {
    if (!dependencies || typeof dependencies !== 'object') return
    for (const [name, dependency] of Object.entries(dependencies)) {
      installedNames.add(name)
      if (dependency && typeof dependency === 'object') visitDependencies(dependency.dependencies)
    }
  }
  visitDependencies(installedTree.dependencies)
  for (const packageName of [
    '@modelcontextprotocol/sdk',
    'hono',
    'fast-uri',
    'ip-address',
  ]) {
    assert.equal(
      installedNames.has(packageName),
      false,
      `packed M1 consumer unexpectedly installed upstream-only audited dependency ${packageName}`,
    )
  }

  const probe = spawnSync(process.execPath, [
    '--input-type=module',
    '--eval',
    [
      "const m = await import('@penrix/dsh-chatgpt-web')",
      "if (m.PROVIDER !== 'chatgpt-web') throw new Error('provider export mismatch')",
      "if (typeof m.ChatGptWebAdapter !== 'function') throw new Error('adapter export missing')",
      "if ('SendSafetyLease' in m) throw new Error('acceptance helper leaked into packed API')",
      "console.log('PACKED_IMPORT_OK')",
    ].join(';'),
  ], { cwd: installRoot, encoding: 'utf8' })
  if (probe.status !== 0) {
    if (probe.stdout) process.stderr.write(probe.stdout)
    if (probe.stderr) process.stderr.write(probe.stderr)
    throw new Error(`packed import failed with status ${probe.status}`)
  }
  assert.match(probe.stdout, /PACKED_IMPORT_OK/)

  console.log('M1 packed install smoke: PASS (fresh consumer, production deps only, no browser launched)')
} finally {
  rmSync(temp, { recursive: true, force: true })
}
