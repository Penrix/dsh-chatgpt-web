import { describe, expect, it } from 'vitest'
import {
  FRESH_PAGE_MIN_INTERVAL_MS,
  FRESH_PAGE_WINDOW_MS,
  FreshPageSafetyGate,
  createFreshPageAfterGate,
} from '../src/chatgpt/fresh-page-safety.ts'

class FakeTime {
  nowMs = 0
  sleeps: number[] = []

  now = () => this.nowMs

  sleep = async (delayMs: number, signal?: AbortSignal): Promise<void> => {
    if (signal?.aborted) throw signal.reason ?? new Error('aborted')
    this.sleeps.push(delayMs)
    this.nowMs += delayMs
    if (signal?.aborted) throw signal.reason ?? new Error('aborted')
  }
}

describe('FreshPageSafetyGate', () => {
  it('enforces a 30-second minimum cadence without real sleeping', async () => {
    const time = new FakeTime()
    const gate = new FreshPageSafetyGate({ now: time.now, sleep: time.sleep })

    await gate.waitForSlot()
    expect(time.nowMs).toBe(0)

    await gate.waitForSlot()
    expect(time.nowMs).toBe(FRESH_PAGE_MIN_INTERVAL_MS)
    expect(time.sleeps.reduce((sum, value) => sum + value, 0)).toBe(FRESH_PAGE_MIN_INTERVAL_MS)
  })

  it('enforces at most 8 fresh starts in a rolling 300-second window', async () => {
    const time = new FakeTime()
    const gate = new FreshPageSafetyGate({ now: time.now, sleep: time.sleep })

    for (let index = 0; index < 8; index += 1) await gate.waitForSlot()
    expect(time.nowMs).toBe(210_000)

    await gate.waitForSlot()
    expect(time.nowMs).toBe(FRESH_PAGE_WINDOW_MS)
    expect(gate.state().startsInWindow).toBe(8)
  })

  it('applies 120/240/480/600 cooldowns and resets strikes after 1800 seconds', () => {
    const time = new FakeTime()
    const gate = new FreshPageSafetyGate({ now: time.now, sleep: time.sleep })

    expect(gate.noteHistoryRateLimit().historyCooldownRemainingMs).toBe(120_000)
    time.nowMs = 120_000
    expect(gate.noteHistoryRateLimit().historyCooldownRemainingMs).toBe(240_000)
    time.nowMs = 360_000
    expect(gate.noteHistoryRateLimit().historyCooldownRemainingMs).toBe(480_000)
    time.nowMs = 840_000
    expect(gate.noteHistoryRateLimit().historyCooldownRemainingMs).toBe(600_000)
    time.nowMs = 1_440_000
    expect(gate.noteHistoryRateLimit().historyCooldownRemainingMs).toBe(600_000)

    time.nowMs += 1_800_000
    expect(gate.state().historyRateLimitStrikes).toBe(0)
    expect(gate.noteHistoryRateLimit().historyCooldownRemainingMs).toBe(120_000)
  })

  it('aborts while pacing without creating a page', async () => {
    let nowMs = 0
    const controller = new AbortController()
    const gate = new FreshPageSafetyGate({
      now: () => nowMs,
      sleep: async (delayMs, signal) => {
        nowMs += Math.min(delayMs, 1_000)
        controller.abort(new Error('stop pacing'))
        if (signal?.aborted) throw signal.reason
      },
    })
    await gate.waitForSlot()

    let creates = 0
    await expect(createFreshPageAfterGate(
      gate,
      async () => {
        creates += 1
        return {}
      },
      controller.signal,
    )).rejects.toThrow(/stop pacing|aborted/i)
    expect(creates).toBe(0)
  })
})
