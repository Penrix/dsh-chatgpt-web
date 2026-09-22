import TurndownService from 'turndown'
import { LlmError } from '@deepseek-ai/dsh-llm'
import type { Page } from 'playwright-core'
import { CompletionTracker } from './completion.ts'
import { selectModelEffort } from './effort.ts'
import {
  CHATGPT_ASSISTANT_TURN_SELECTOR,
  CHATGPT_COMPLETION_ACTION_SELECTOR,
  CHATGPT_COMPOSER_SELECTOR,
  CHATGPT_STOP_BUTTON_SELECTOR,
  CHATGPT_TEMPORARY_CHAT_URL,
  detectChatGptAccountCapabilities,
} from './session.ts'
import {
  dismissTemporaryChatOnboarding,
  throwIfRateLimitDialog,
  throwIfSessionFailureAlert,
  throwIfTerminalError,
} from './guards.ts'

const SEND = 'button[data-testid="send-button"], #composer-submit-button'

export interface TurnOptions {
  model: string
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

async function composer(page: Page) {
  const node = page.locator(CHATGPT_COMPOSER_SELECTOR).filter({ visible: true }).last()
  await node.waitFor({ state: 'visible', timeout: 45_000 })
  return node
}

async function sendButton(page: Page) {
  const node = page.locator(SEND).filter({ visible: true }).first()
  await node.waitFor({ state: 'visible', timeout: 30_000 })
  return node
}

async function markdownFromLastAssistant(page: Page): Promise<string> {
  const assistant = page.locator(CHATGPT_ASSISTANT_TURN_SELECTOR).last()
  const markdown = assistant.locator('.markdown').last()
  const html = await markdown.innerHTML().catch(async () => await assistant.innerHTML())
  const turndown = new TurndownService({ codeBlockStyle: 'fenced', bulletListMarker: '-' })
  const result = turndown.turndown(html).trim()
  if (result) return result
  return (await assistant.innerText()).trim()
}

async function stopGenerationBestEffort(page: Page): Promise<void> {
  const stop = page.locator(CHATGPT_STOP_BUTTON_SELECTOR).filter({ visible: true }).first()
  if (await stop.isVisible().catch(() => false)) await stop.click().catch(() => {})
}

export async function runFreshTurn(page: Page, prompt: string, options: TurnOptions): Promise<TurnResult> {
  let sent = false
  try {
    await page.goto(CHATGPT_TEMPORARY_CHAT_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    await dismissTemporaryChatOnboarding(page)
    await throwIfRateLimitDialog(page)
    await throwIfSessionFailureAlert(page)

    const input = await composer(page)
    const capabilities = await detectChatGptAccountCapabilities(page)
    await selectModelEffort(page, options.model, capabilities)
    const baselineAssistantCount = await page.locator(CHATGPT_ASSISTANT_TURN_SELECTOR).count()
    const baselineCopyActionCount = await page.locator(CHATGPT_COMPLETION_ACTION_SELECTOR).count()

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

      const assistantCount = await page.locator(CHATGPT_ASSISTANT_TURN_SELECTOR).count()
      const copyActionCount = await page.locator(CHATGPT_COMPLETION_ACTION_SELECTOR).count()
      const running = await page.locator(CHATGPT_STOP_BUTTON_SELECTOR).filter({ visible: true }).count().then(count => count > 0).catch(() => false)
      const text = assistantCount > baselineAssistantCount
        ? await page.locator(CHATGPT_ASSISTANT_TURN_SELECTOR).last().innerText().catch(() => '')
        : ''

      if (tracker.update({ assistantCount, copyActionCount, running, text })) {
        const final = await markdownFromLastAssistant(page)
        if (!final) throw new PostSendFailure('ChatGPT completed without an extractable final answer.')
        return { text: final }
      }

      await throwIfRateLimitDialog(page)
      await throwIfSessionFailureAlert(page)
      try {
        await throwIfTerminalError(page)
      } catch (error) {
        throw new PostSendFailure(error instanceof Error ? error.message : String(error), error)
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
