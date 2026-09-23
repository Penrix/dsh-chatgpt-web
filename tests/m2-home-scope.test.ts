import { describe, expect, it } from 'vitest'
import {
  restoreHomeEnvironment,
  snapshotHomeEnvironment,
  withTemporaryHome,
} from '../scripts/m2-home-scope.mjs'

describe('M2 meow HOME/USERPROFILE scope', () => {
  it('restores the original environment before later adapter/browser use', async () => {
    const env: Record<string, string | undefined> = {
      HOME: 'C:\\Users\\123',
      USERPROFILE: 'C:\\Users\\123',
    }
    const original = snapshotHomeEnvironment(env)
    const fakeHome = 'C:\\Temp\\m2-fake-home'

    await withTemporaryHome(fakeHome, async () => {
      expect(env.HOME).toBe(fakeHome)
      expect(env.USERPROFILE).toBe(fakeHome)
    }, env)

    const adapterLaunchObservation = snapshotHomeEnvironment(env)
    expect(adapterLaunchObservation).toEqual(original)
  })

  it('restores the original environment when meow import/bootstrap throws', async () => {
    const env: Record<string, string | undefined> = {
      HOME: 'C:\\Users\\123',
      USERPROFILE: 'C:\\Users\\123',
    }
    const original = snapshotHomeEnvironment(env)

    await expect(withTemporaryHome('C:\\Temp\\m2-fake-home', async () => {
      expect(env.HOME).toBe('C:\\Temp\\m2-fake-home')
      expect(env.USERPROFILE).toBe('C:\\Temp\\m2-fake-home')
      throw new Error('synthetic meow import failure')
    }, env)).rejects.toThrow('synthetic meow import failure')

    expect(snapshotHomeEnvironment(env)).toEqual(original)
  })

  it('defensive restoration preserves undefined variables exactly', () => {
    const env: Record<string, string | undefined> = {
      HOME: undefined,
      USERPROFILE: undefined,
    }
    const original = snapshotHomeEnvironment(env)
    env.HOME = 'fake'
    env.USERPROFILE = 'fake'
    restoreHomeEnvironment(original, env)
    expect(env.HOME).toBeUndefined()
    expect(env.USERPROFILE).toBeUndefined()
  })
})
