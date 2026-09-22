import { existsSync } from 'node:fs'
import { homedir, platform } from 'node:os'
import { join, resolve } from 'node:path'
import { chromium, type BrowserContext, type Page } from 'playwright-core'
import { LlmError } from '@deepseek-ai/dsh-llm'

const COMPOSER = '#prompt-textarea, [data-testid="prompt-textarea"], [contenteditable="true"][role="textbox"]'

function expandHome(path: string): string {
  if (path === '~') return homedir()
  if (path.startsWith('~/') || path.startsWith('~\\')) return join(homedir(), path.slice(2))
  return resolve(path)
}

export function defaultProfileDir(): string {
  return join(homedir(), '.dsh-chatgpt-web-penrix', 'chrome-profile')
}

export function resolveChromeExecutable(explicit?: string): string {
  if (explicit) {
    const resolved = expandHome(explicit)
    if (!existsSync(resolved)) throw new Error(`Configured Chrome executable does not exist: ${resolved}`)
    return resolved
  }

  const candidates = platform() === 'win32'
    ? [
        join(process.env.LOCALAPPDATA ?? '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
        'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
      ]
    : platform() === 'darwin'
      ? [
          '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
          '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
        ]
      : [
          '/usr/bin/google-chrome',
          '/usr/bin/google-chrome-stable',
          '/usr/bin/chromium',
          '/usr/bin/chromium-browser',
          '/usr/bin/microsoft-edge',
        ]

  const found = candidates.find(candidate => candidate.length > 0 && existsSync(candidate))
  if (!found) {
    throw new Error('Chrome/Edge executable not found. Set chromeExecutablePath explicitly.')
  }
  return found
}

export interface BrowserOptions {
  profileDir: string
  chromeExecutablePath?: string
  headed: boolean
  loginTimeoutMs: number
}

export class ChatGptBrowser {
  private context: BrowserContext | undefined
  private opening: Promise<void> | undefined

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

  async newTurnPage(signal?: AbortSignal): Promise<Page> {
    await this.ensureReady(signal)
    if (!this.context) throw new LlmError('ChatGPT browser context is unavailable.', 'TRANSPORT')
    try {
      return await this.context.newPage()
    } catch (error) {
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
    const profileDir = expandHome(this.options.profileDir)
    const executablePath = resolveChromeExecutable(this.options.chromeExecutablePath)

    const context = await chromium.launchPersistentContext(profileDir, {
      executablePath,
      headless: !this.options.headed,
      viewport: null,
      args: ['--disable-blink-features=AutomationControlled'],
      ignoreDefaultArgs: ['--enable-automation'],
    })

    this.context = context
    const page = context.pages()[0] ?? await context.newPage()
    await page.goto('https://chatgpt.com/', { waitUntil: 'domcontentloaded', timeout: 60_000 })

    const deadline = Date.now() + this.options.loginTimeoutMs
    for (;;) {
      if (signal?.aborted) throw new LlmError('ChatGPT sign-in aborted.', 'ABORTED')
      const visible = await page.locator(COMPOSER).first().isVisible().catch(() => false)
      if (visible) break
      if (Date.now() >= deadline) {
        throw new LlmError(
          'Timed out waiting for a logged-in ChatGPT composer. Sign in inside the dedicated browser window and retry.',
          'TIMEOUT',
        )
      }
      await page.waitForTimeout(1_000)
    }
  }
}
