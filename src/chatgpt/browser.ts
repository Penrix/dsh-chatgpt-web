import { chromium, type BrowserContext, type Page } from 'playwright-core'
import { LlmError } from '@deepseek-ai/dsh-llm'
import { CHATGPT_COMPOSER_SELECTOR, assertAuthenticatedChatGptPage } from './session.ts'
import type { SendSafetyLease } from './send-safety.ts'
import {
  FreshPageSafetyGate,
  createFreshPageAfterGate,
  type FreshPageSafetyState,
} from './fresh-page-safety.ts'

import { expandHomePath, resolveChromeExecutable } from './chrome.ts'
export { defaultProfileDir, resolveChromeExecutable } from './chrome.ts'

export interface BrowserOptions {
  profileDir: string
  chromeExecutablePath?: string
  headed: boolean
  loginTimeoutMs: number
}

const PAGE_SAFETY_GATES = new WeakMap<Page, FreshPageSafetyGate>()

export function bindPageFreshSafetyGate(page: Page, gate: FreshPageSafetyGate): void {
  PAGE_SAFETY_GATES.set(page, gate)
}

export function noteHistoryRateLimitForPage(page: Page): FreshPageSafetyState | undefined {
  return PAGE_SAFETY_GATES.get(page)?.noteHistoryRateLimit()
}

export class ChatGptBrowser {
  private context: BrowserContext | undefined
  private opening: Promise<void> | undefined
  private readonly freshPageSafety = new FreshPageSafetyGate()

  constructor(private readonly options: BrowserOptions) {}

  async ensureReady(signal?: AbortSignal): Promise<void> {
    if (this.context) return
    this.opening ??= this.open(signal)
    try {
      await this.opening
    } finally {
      this.opening = undefined
    }
  }

  async newTurnPage(safety: Pick<SendSafetyLease, 'reserveFreshPage'>, signal?: AbortSignal): Promise<Page> {
    const startingBrowser = !this.context
    if (startingBrowser) {
      await safety.reserveFreshPage(signal)
      await this.freshPageSafety.waitForSlot(signal)
    }
    await this.ensureReady(signal)
    if (!this.context) throw new LlmError('ChatGPT browser context is unavailable.', 'TRANSPORT')
    try {
      if (startingBrowser) {
        const startupPage = this.context.pages().find(page => !page.isClosed())
        if (startupPage) {
          bindPageFreshSafetyGate(startupPage, this.freshPageSafety)
          return startupPage
        }
      }
      await safety.reserveFreshPage(signal)
      const page = await createFreshPageAfterGate(
        this.freshPageSafety,
        () => this.context!.newPage(),
        signal,
      )
      bindPageFreshSafetyGate(page, this.freshPageSafety)
      return page
    } catch (error) {
      if (error instanceof LlmError) throw error
      throw new LlmError('Failed to open a fresh ChatGPT page.', 'TRANSPORT', { cause: error })
    }
  }

  async close(): Promise<void> {
    const context = this.context
    this.context = undefined
    await context?.close().catch(() => {})
  }

  private async open(signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) throw new LlmError('ChatGPT browser startup aborted.', 'ABORTED')
    const profileDir = expandHomePath(this.options.profileDir)
    const executablePath = resolveChromeExecutable(this.options.chromeExecutablePath)

    const context = await chromium.launchPersistentContext(profileDir, {
      executablePath,
      headless: !this.options.headed,
      viewport: null,
      args: ['--disable-blink-features=AutomationControlled'],
      ignoreDefaultArgs: ['--enable-automation'],
    })

    try {
      const page = context.pages()[0] ?? await context.newPage()
      await page.goto('https://chatgpt.com/', { waitUntil: 'domcontentloaded', timeout: 60_000 })

      const deadline = Date.now() + this.options.loginTimeoutMs
      for (;;) {
        if (signal?.aborted) throw new LlmError('ChatGPT sign-in aborted.', 'ABORTED')
        const visible = await page.locator(CHATGPT_COMPOSER_SELECTOR).first().isVisible().catch(() => false)
        if (visible) {
          await assertAuthenticatedChatGptPage(page)
          break
        }
        if (Date.now() >= deadline) {
          throw new LlmError(
            'Timed out waiting for a logged-in ChatGPT composer. Sign in inside the dedicated browser window and retry.',
            'TIMEOUT',
          )
        }
        await page.waitForTimeout(1_000)
      }

      // Publish the context only after login readiness is proven. A failed
      // first-run login must not poison the next request with a false-ready
      // context.
      this.context = context
    } catch (error) {
      await context.close().catch(() => {})
      throw error
    }
  }
}
