import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const helperUrl = pathToFileURL(resolve('scripts/m2-home-scope.mjs')).href

function runScenario(source: string) {
  return spawnSync(process.execPath, ['--input-type=module', '--eval', source], {
    encoding: 'utf8',
  })
}

function importPrefix() {
  return `import { restoreHomeEnvironment, snapshotHomeEnvironment, withTemporaryHome } from ${JSON.stringify(helperUrl)}\n`
}

describe('M2 meow HOME/USERPROFILE scope', () => {
  it('restores the original environment before later adapter/browser use', () => {
    const result = runScenario(importPrefix() + `
const env = { HOME: 'C:\\\\Users\\\\123', USERPROFILE: 'C:\\\\Users\\\\123' }
const original = snapshotHomeEnvironment(env)
const fakeHome = 'C:\\\\Temp\\\\m2-fake-home'
await withTemporaryHome(fakeHome, async () => {
  if (env.HOME !== fakeHome || env.USERPROFILE !== fakeHome) throw new Error('fake home not applied')
}, env)
const adapterLaunchObservation = snapshotHomeEnvironment(env)
process.stdout.write(JSON.stringify({ original, adapterLaunchObservation }))
`)

    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
    const parsed = JSON.parse(result.stdout) as {
      original: { HOME?: string; USERPROFILE?: string }
      adapterLaunchObservation: { HOME?: string; USERPROFILE?: string }
    }
    expect(parsed.adapterLaunchObservation).toEqual(parsed.original)
  })

  it('restores the original environment when meow import/bootstrap throws', () => {
    const result = runScenario(importPrefix() + `
const env = { HOME: 'C:\\\\Users\\\\123', USERPROFILE: 'C:\\\\Users\\\\123' }
const original = snapshotHomeEnvironment(env)
let message = ''
try {
  await withTemporaryHome('C:\\\\Temp\\\\m2-fake-home', async () => {
    throw new Error('synthetic meow import failure')
  }, env)
} catch (error) {
  message = error.message
}
process.stdout.write(JSON.stringify({ message, original, restored: snapshotHomeEnvironment(env) }))
`)

    expect(result.status).toBe(0)
    const parsed = JSON.parse(result.stdout) as {
      message: string
      original: { HOME?: string; USERPROFILE?: string }
      restored: { HOME?: string; USERPROFILE?: string }
    }
    expect(parsed.message).toBe('synthetic meow import failure')
    expect(parsed.restored).toEqual(parsed.original)
  })

  it('restores originally undefined values exactly', () => {
    const result = runScenario(importPrefix() + `
const env = {}
const original = snapshotHomeEnvironment(env)
env.HOME = 'fake'
env.USERPROFILE = 'fake'
restoreHomeEnvironment(original, env)
process.stdout.write(JSON.stringify({
  hasHome: Object.prototype.hasOwnProperty.call(env, 'HOME'),
  hasUserProfile: Object.prototype.hasOwnProperty.call(env, 'USERPROFILE'),
}))
`)

    expect(result.status).toBe(0)
    expect(JSON.parse(result.stdout)).toEqual({ hasHome: false, hasUserProfile: false })
  })
})
