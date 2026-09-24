/**
 * Fresh-page pacing for the ChatGPT Web transport.
 *
 * Architecture/constants are independently reimplemented in TypeScript after
 * studying MoonTzai/folderbridge-mcp chatgpt-web-llm-adapter v0.3.2
 * (Apache-2.0). No source code is copied.
 */
import { LlmError } from '@deepseek-ai/dsh-llm'

export const FRESH_PAGE_MIN_INTERVAL_MS = 20_000
export const FRESH_PAGE_WINDOW_MS = 300_000
export const FRESH_PAGE_WINDOW_MAX = 8
export const HISTORY_COOLDOWN_MS = [120_000, 240_000, 480_000, 600_000] as const
export const HISTORY_COOLDOWN_RESET_MS = 1_800_000

export interface FreshPageSafetyState {
  startsInWindow: number
  nextStartInMs: number
  historyCooldownRemainingMs: number
  historyRateLimitStrikes: number
}

export interface FreshPageSafetyOptions {
  now?: () => number
  sleep?: (delayMs: number, signal?: AbortSignal) => Promise<void>
}

function defaultNow(): number {
  return performance.now()
}

async function defaultSleep(delayMs: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    throw new LlmError('ChatGPT fresh-page pacing aborted.', 'ABORTED')
  }
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(resolve, Math.max(0, delayMs))
    const onAbort = () => {
      clearTimeout(timeout)
      reject(new LlmError('ChatGPT fresh-page pacing aborted.', 'ABORTED'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
    const cleanup = () => signal?.removeEventListener('abort', onAbort)
    Promise.resolve().then(() => {}).finally(() => {
      // cleanup is also performed by the timeout/abort continuations below
    })
    const originalResolve = resolve
    resolve = () => {
      cleanup()
      originalResolve()
    }
  })
}

export class FreshPageSafetyGate {
  private readonly now: () => number
  private readonly sleep: (delayMs: number, signal?: AbortSignal) => Promise<void>
  private readonly starts: number[] = []
  private nextStartAt = 0
  private cooldownUntil = 0
  private strikes = 0
  private lastHistoryLimitAt: number | undefined

  constructor(options: FreshPageSafetyOptions = {}) {
    this.now = options.now ?? defaultNow
    this.sleep = options.sleep ?? defaultSleep
  }

  state(): FreshPageSafetyState {
    const now = this.now()
    this.prune(now)
    const earliest = this.earliestStart(now)
    return {
      startsInWindow: this.starts.length,
      nextStartInMs: Math.max(0, Math.ceil(earliest - now)),
      historyCooldownRemainingMs: Math.max(0, Math.ceil(this.cooldownUntil - now)),
      historyRateLimitStrikes: this.strikes,
    }
  }

  async waitForSlot(signal?: AbortSignal): Promise<FreshPageSafetyState> {
    for (;;) {
      if (signal?.aborted) {
        throw new LlmError('ChatGPT fresh-page pacing aborted.', 'ABORTED')
      }
      const now = this.now()
      this.prune(now)
      const earliest = this.earliestStart(now)
      if (now >= earliest) {
        this.starts.push(now)
        this.nextStartAt = now + FRESH_PAGE_MIN_INTERVAL_MS
        return this.state()
      }
      await this.sleep(Math.min(1_000, Math.max(1, earliest - now)), signal)
    }
  }

  noteHistoryRateLimit(): FreshPageSafetyState {
    const now = this.now()
    this.prune(now)
    this.strikes += 1
    this.lastHistoryLimitAt = now
    const index = Math.min(this.strikes - 1, HISTORY_COOLDOWN_MS.length - 1)
    const cooldown = HISTORY_COOLDOWN_MS[index] ?? HISTORY_COOLDOWN_MS[HISTORY_COOLDOWN_MS.length - 1]
    this.cooldownUntil = Math.max(this.cooldownUntil, now + cooldown)
    return this.state()
  }

  private prune(now: number): void {
    const cutoff = now - FRESH_PAGE_WINDOW_MS
    while (this.starts.length > 0 && (this.starts[0] ?? Number.POSITIVE_INFINITY) <= cutoff) {
      this.starts.shift()
    }
    if (
      this.lastHistoryLimitAt !== undefined
      && now - this.lastHistoryLimitAt >= HISTORY_COOLDOWN_RESET_MS
    ) {
      this.strikes = 0
      this.lastHistoryLimitAt = undefined
    }
  }

  private earliestStart(now: number): number {
    let earliest = Math.max(this.nextStartAt, this.cooldownUntil)
    if (this.starts.length >= FRESH_PAGE_WINDOW_MAX) {
      earliest = Math.max(earliest, (this.starts[0] ?? now) + FRESH_PAGE_WINDOW_MS)
    }
    return earliest
  }
}

export async function createFreshPageAfterGate<T>(
  gate: FreshPageSafetyGate,
  createPage: () => Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  await gate.waitForSlot(signal)
  if (signal?.aborted) {
    throw new LlmError('ChatGPT fresh-page pacing aborted.', 'ABORTED')
  }
  return createPage()
}
