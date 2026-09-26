import { mkdir, open, readFile, unlink, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { LlmError } from '@deepseek-ai/dsh-llm'

export const MIN_SEND_INTERVAL_MS = 30_000
// Deliberately shared across profiles and adapters for this Windows user.
// Account identity is not reliably exposed by the page; sharing is conservative.
const DEFAULT_ROOT = join(homedir(), '.dsh-chatgpt-web-penrix', 'send-safety')

interface State {
  notBefore: number
  pending: boolean
  blocked: string | null
}

interface Options {
  /** Offline-test seam only. Not exposed in plugin configuration. */
  root?: string
  now?: () => number
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>
}

function stopped(message: string, cause?: unknown): LlmError {
  return new LlmError(`ChatGPT 发送已停止：${message}`, 'PROVIDER_ERROR', { cause })
}

export class SendSafetyLease {
  private released = false

  private constructor(
    private readonly root: string,
    private readonly state: State,
    private readonly now: () => number,
    private readonly sleep: (ms: number, signal?: AbortSignal) => Promise<void>,
  ) {}

  static async acquire(options: Options = {}): Promise<SendSafetyLease> {
    const root = options.root ?? DEFAULT_ROOT
    const now = options.now ?? Date.now
    const sleep = options.sleep ?? (async (ms, signal) => {
      await delay(ms, undefined, signal ? { signal } : {})
    })
    try {
      await mkdir(root, { recursive: true })
      const lock = await open(join(root, 'turn.lock'), 'wx')
      await lock.close()
    } catch (error) {
      throw stopped('已有测试运行，或上次运行未正常结束。请核对后再恢复；不会自动抢锁。', error)
    }
    try {
      let state: State
      try {
        state = JSON.parse(await readFile(join(root, 'state.json'), 'utf8')) as State
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
        // Unknown previous Send time: wait a full interval on first use.
        state = { notBefore: now() + MIN_SEND_INTERVAL_MS, pending: false, blocked: null }
      }
      if (!state || !Number.isFinite(state.notBefore) || state.notBefore < 0
        || typeof state.pending !== 'boolean'
        || !(state.blocked === null || typeof state.blocked === 'string')) {
        throw new Error('Invalid persisted send-safety state')
      }
      if (state.blocked || state.pending) {
        throw stopped('上次触发限流或发送结果尚未确认，需要人工核对。')
      }
      return new SendSafetyLease(root, state, now, sleep)
    } catch (error) {
      await unlink(join(root, 'turn.lock'))
      throw stopped('无法安全恢复发送状态。', error)
    }
  }

  private async save(): Promise<void> {
    // A crash during this write leaves an unreadable state, which fails closed.
    await writeFile(join(this.root, 'state.json'), JSON.stringify(this.state), 'utf8')
  }

  async dispatch(click: () => Promise<void>, signal?: AbortSignal): Promise<void> {
    if (this.released || this.state.pending || this.state.blocked) throw stopped('发送许可不可用。')
    while (this.now() < this.state.notBefore) {
      if (signal?.aborted) throw new LlmError('ChatGPT send wait aborted.', 'ABORTED')
      await this.sleep(Math.min(1_000, this.state.notBefore - this.now()), signal)
    }
    if (signal?.aborted) throw new LlmError('ChatGPT send wait aborted.', 'ABORTED')
    this.state.pending = true
    this.state.notBefore = this.now() + MIN_SEND_INTERVAL_MS
    await this.save()
    try {
      await click()
    } finally {
      // Count from click settlement, not page creation or a queued slot. A slow
      // browser click can dispatch long after the wait above has completed.
      this.state.notBefore = Math.max(this.state.notBefore, this.now() + MIN_SEND_INTERVAL_MS)
      await this.save()
    }
  }

  async complete(): Promise<void> {
    this.state.pending = false
    await this.save()
  }

  async block(): Promise<void> {
    this.state.blocked = 'rate-limit-or-account-warning'
    await this.save()
  }

  async release(): Promise<void> {
    if (this.released) return
    this.released = true
    await unlink(join(this.root, 'turn.lock'))
  }
}
