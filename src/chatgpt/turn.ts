import TurndownService from 'turndown'
import { LlmError } from '@deepseek-ai/dsh-llm'
import type { Page } from 'playwright-core'
import { CompletionTracker } from './completion.ts'

const TEMPORARY_CHAT_URL = 'https://chatgpt.com/?temporary-chat=true'
const COMPOSER = '#prompt-textarea, [data-testid="prompt-textarea"], [contenteditable="true"][role="textbox"]'
const SEND = 'button[data-testid="send-button"], #composer-submit-button'
const ASSISTANT = '[data-message-author-role="assistant"]'
const COPY_ACTION = 'button[data-testid="copy-turn-action-button"]'
const STOP = 'button[data-testid="stop-button"]'

export interface TurnOptions {
  timeoutMs: number
  signal?: AbortSignal
}

export interface TurnResult {
  text: string
}

class PostSendFailure extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message)
    this.name = 'PostSendFailure'
  }
}

async function dismissTemporaryChatOnboarding(page: Page): Promise<void> {
  const dialog = page.locator('[role="dialog"]').filter({ hasText: /Not in history|Memory off|No model training/i }).last()
  if (!await dialog.isVisible().catch(() => false)) return
  const action = dialog.getByRole('button', { name: /Continue|Got it|继续|知道了/i }).last()
  if (await action.isVisible().catch(() => false)) await action.click()
}

async function composer(page: Page) {
  const node = page.locator(COMPOSER).first()
  await node.waitFor({ state: 'visible', timeout: 45_000 })
  return node
}

async function sendButton(page: Page) {
  const node = page.locator(SEND).filter({ visible: true }).first()
  await node.waitFor({ state: 'visible', timeout: 30_000 })
  return node
}

async function markdownFromLastAssistant(page: Page): Promise<string> {
  const assistant = page.locator(ASSISTANT).last()
  const markdown = assistant.locator('.markdown').last()
  const html = await markdown.innerHTML().catch(async () => await assistant.innerHTML())
  const turndown = new TurndownService({ codeBlockStyle: 'fenced', bulletListMarker: '-' })
  const result = turndown.turndown(html).trim()
  if (result) return result
  return (await assistant.innerText()).trim()
}

async function stopGenerationBestEffort(page: Page): Promise<void> {
  const stop = page.locator(STOP).filter({ visible: true }).first()
  if (await stop.isVisible().catch(() => false)) await stop.click().catch(() => {})
}

export async function runFreshTurn(page: Page, prompt: string, options: TurnOptions): Promise<TurnResult> {
  let sent = false
  try {
    await page.goto(TEMPORARY_CHAT_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await dismissTemporaryChatOnboarding(page)

    const input = await composer(page)
    const baselineAssistantCount = await page.locator(ASSISTANT).count()
    const baselineCopyActionCount = await page.locator(COPY_ACTION).count()

    if (options.signal?.aborted) throw new LlmError('ChatGPT turn aborted before Send.', 'ABORTED')

    await input.fill(prompt)
    const button = await sendButton(page)
    await button.click()
    sent = true

    const tracker = new CompletionTracker(baselineAssistantCount, baselineCopyActionCount)
    const deadline = Date.now() + options.timeoutMs

    for (;;) {
      if (options.signal?.aborted) {
        await stopGenerationBestEffort(page)
        throw new PostSendFailure('ChatGPT turn was aborted after Send.')
      }
      if (Date.now() >= deadline) {
        await stopGenerationBestEffort(page)
        throw new PostSendFailure('ChatGPT turn timed out after Send.')
      }

      const assistantCount = await page.locator(ASSISTANT).count()
      const copyActionCount = await page.locator(COPY_ACTION).count()
      const running = await page.locator(STOP).filter({ visible: true }).count().then(count => count > 0).catch(() => false)
      const text = assistantCount > baselineAssistantCount
        ? await page.locator(ASSISTANT).last().innerText().catch(() => '')
        : ''

      if (tracker.update({ assistantCount, copyActionCount, running, text })) {
        const final = await markdownFromLastAssistant(page)
        if (!final) throw new PostSendFailure('ChatGPT completed without an extractable final answer.')
        return { text: final }
      }

      const bodyText = await page.locator('body').innerText().catch(() => '')
      if (/Something went wrong|There was an error generating a response/i.test(bodyText)) {
        throw new PostSendFailure('ChatGPT reported a generation error after Send.')
      }

      await page.waitForTimeout(500)
    }
  } catch (error) {
    if (error instanceof LlmError) throw error
    if (sent || error instanceof PostSendFailure) {
      throw new LlmError(
        `ChatGPT Web outcome is uncertain after Send; the provider will not resend automatically. ${error instanceof Error ? error.message : String(error)}`,
        'PROVIDER_ERROR',
        { cause: error },
      )
    }
    throw new LlmError(
      `ChatGPT Web turn failed before Send: ${error instanceof Error ? error.message : String(error)}`,
      'TRANSPORT',
      { cause: error },
    )
  }
}
