import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const manifest = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'))

for (const relative of [manifest.main, manifest.types, manifest.dsh?.bundle?.patch]) {
  assert.equal(typeof relative, 'string', 'package entrypoint/bundle path must be declared')
  assert.ok(existsSync(resolve(root, relative)), `missing built/package path: ${relative}`)
}

const entry = await import(pathToFileURL(resolve(root, manifest.main)).href)
assert.equal(entry.PROVIDER, 'chatgpt-web')
assert.equal(typeof entry.apply, 'function')
assert.equal(typeof entry.Config, 'function')
assert.equal(typeof entry.ChatGptWebAdapter, 'function')

const registrations = []
const cleanups = []
const ctx = {
  llm: {
    registerAdapter(routes, adapter) {
      registrations.push({ routes: [...routes], adapter })
    },
  },
  effect(factory) {
    const cleanup = factory()
    if (typeof cleanup === 'function') cleanups.push(cleanup)
    return () => {}
  },
}

const config = entry.Config({
  profileDir: resolve(root, '.m1-smoke-profile'),
  chromeExecutablePath: process.execPath,
  headed: false,
  loginTimeoutMs: 1000,
  turnTimeoutMs: 1000,
  composerMaxChars: 10000,
  contextWindow: 90000,
  maxTokens: 1024,
})

entry.apply(ctx, config)
assert.equal(registrations.length, 1)
assert.deepEqual(registrations[0].routes, ['chatgpt-web'])

const patch = await readFile(resolve(root, manifest.dsh.bundle.patch), 'utf8')
assert.match(patch, /id:\s*penrix-llm-chatgpt-web/)
assert.match(patch, /name:\s*['\"]@penrix\/dsh-chatgpt-web['\"]/)

for (const cleanup of cleanups.reverse()) await cleanup()
console.log('M1 load smoke: PASS (built entrypoint + bundle metadata + adapter registration; no browser launched)')
