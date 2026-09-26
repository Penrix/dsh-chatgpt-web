import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))
const script = resolve(here, '../scripts/m2-profile-quiescence.mjs')
const profile = resolve(here, '.tmp-m2-profile')

function run(sequence: unknown, timeoutMs: number, pollMs = 0) {
  return spawnSync(process.execPath, [
    script,
    '--profile', profile,
    '--timeout-ms', String(timeoutMs),
    '--poll-ms', String(pollMs),
  ], {
    encoding: 'utf8',
    env: {
      ...process.env,
      M2_PROFILE_QUIESCENCE_TEST_SEQUENCE: JSON.stringify(sequence),
    },
  })
}

describe('M2 dedicated profile quiescence barrier', () => {
  it('waits through a sequential M1 browser handoff and succeeds once the exact profile is released', () => {
    const result = run([
      [{ pid: 244, name: 'chrome.exe' }],
      [{ pid: 244, name: 'chrome.exe' }],
      [],
    ], 10_000)

    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
    const parsed = JSON.parse(result.stdout.trim()) as {
      status: string
      polls: number
      remaining: unknown[]
    }
    expect(parsed.status).toBe('quiescent')
    expect(parsed.polls).toBe(3)
    expect(parsed.remaining).toEqual([])
  })

  it('fails closed without killing anything when the dedicated profile stays occupied', () => {
    const result = run([
      [{ pid: 244, name: 'chrome.exe' }],
    ], 0)

    expect(result.status).toBe(2)
    const parsed = JSON.parse(result.stderr.trim()) as {
      status: string
      code: string
      message: string
      remaining: Array<{ pid: number; name: string }>
    }
    expect(parsed.status).toBe('blocked')
    expect(parsed.code).toBe('M2_PROFILE_BUSY')
    expect(parsed.message).toContain('chrome.exe:244')
    expect(parsed.remaining).toEqual([{ pid: 244, name: 'chrome.exe' }])
  })
})
