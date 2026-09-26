import { LlmError } from '@deepseek-ai/dsh-llm'
import type { Page } from 'playwright-core'
import { CompletionTracker } from './completion.ts'
import { selectModelEffort } from './effort.ts'
import type { SendSafetyLease } from './send-safety.ts'
import {
  CHATGPT_ASSISTANT_TURN_SELECTOR,
  CHATGPT_COMPLETION_ACTION_SELECTOR,
  CHATGPT_COMPOSER_SELECTOR,
  CHATGPT_STOP_BUTTON_SELECTOR,
  CHATGPT_TEMPORARY_CHAT_URL,
  assertTemporaryChatPage,
  detectChatGptAccountCapabilities,
} from './session.ts'
import {
  dismissTemporaryChatOnboarding,
  throwIfRateLimitDialog,
  throwIfSessionFailureAlert,
  throwIfTerminalError,
} from './guards.ts'

export const CHATGPT_SEND_SELECTOR = [
  'button[data-testid="send-button"]',
  '#composer-submit-button',
  'button[aria-label="发送"]',
  'button[aria-label="Send"]',
].join(', ')

export interface TurnOptions {
  model: string
  timeoutMs: number
  sendSafety: SendSafetyLease
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
  const node = page.locator(CHATGPT_SEND_SELECTOR).filter({ visible: true }).first()
  await node.waitFor({ state: 'visible', timeout: 30_000 })
  return node
}

/**
 * Enter the irreversible delivery boundary before invoking the browser click.
 * A click promise may reject after the DOM event was already dispatched, so
 * marking only after it resolves would make an ambiguous send look retry-safe.
 */
export async function dispatchSendFailClosed(
  click: () => Promise<void>,
  markDeliveryPossible: () => void,
): Promise<void> {
  markDeliveryPossible()
  await click()
}

/**
 * Verify the page is still the isolated Temporary Chat surface immediately
 * before crossing the irreversible delivery boundary.
 */
export async function dispatchTemporarySendFailClosed(
  page: Page,
  click: () => Promise<void>,
  markDeliveryPossible: () => void,
  preSendGuard?: () => Promise<void>,
): Promise<void> {
  await assertTemporaryChatPage(page)
  await preSendGuard?.()
  await dispatchSendFailClosed(click, markDeliveryPossible)
}

export async function extractReasoningText(page: Page): Promise<string> {
  const assistant = page.locator(CHATGPT_ASSISTANT_TURN_SELECTOR).last()
  const messageBodies = assistant.locator('[data-message-author-role="assistant"]')
  const body = await messageBodies.count() > 0 ? messageBodies.last() : assistant
  const blocks = body.locator('.markdown')
  if (await blocks.count() === 0) {
    throw new Error('ChatGPT reply has no identifiable answer body; refusing to parse UI controls.')
  }
  // Read displayed text, never re-encode it as Markdown. Preserve all answer
  // blocks so a second JSON object cannot disappear during extraction.
  const texts = await blocks.evaluateAll(roots => roots.map(root => {
    const copy = root.cloneNode(true) as HTMLElement
    for (const control of copy.querySelectorAll('button')) control.remove()
    const codeBlocks = copy.querySelectorAll('pre')
    if (codeBlocks.length > 0) {
      if (codeBlocks.length !== 1) throw new Error('Reply contains multiple code blocks.')
      const pre = codeBlocks[0]!
      const code = pre.querySelector('code')
      if (!code) throw new Error('Reply code block has no code body.')
      const text = code.textContent ?? ''
      pre.remove()
      if (copy.textContent?.trim()) throw new Error('Reply contains content outside the JSON code block.')
      return text
    }
    for (const br of copy.querySelectorAll('br')) br.replaceWith(document.createTextNode('\n'))
    return copy.textContent ?? ''
  }))
  return texts.join('\n').trim()
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
    await assertTemporaryChatPage(page)
    await throwIfRateLimitDialog(page)
    await throwIfSessionFailureAlert(page)

    const input = await composer(page)
    const capabilities = await detectChatGptAccountCapabilities(page)
    await selectModelEffort(page, options.model, capabilities)
    const baselineAssistantCount = await page.locator(CHATGPT_ASSISTANT_TURN_SELECTOR).count()
    const baselineCopyActionCount = await page.locator(CHATGPT_COMPLETION_ACTION_SELECTOR).count()

    if (options.signal?.aborted) throw new LlmError('ChatGPT turn aborted before Send.', 'ABORTED')

    await input.fill(prompt)
    await throwIfRateLimitDialog(page)
    const button = await sendButton(page)
    await options.sendSafety.dispatch(async () => {
      await dispatchTemporarySendFailClosed(
        page,
        () => button.click(),
        () => { sent = true },
        () => throwIfRateLimitDialog(page),
      )
    }, options.signal)

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
        const final = await extractReasoningText(page)
        if (!final) throw new PostSendFailure('ChatGPT completed without an extractable final answer.')
        await options.sendSafety.complete()
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
    if (error instanceof LlmError && error.code === 'RATE_LIMIT') {
      await options.sendSafety.block()
      if (!sent) {
        throw new LlmError('ChatGPT 已限流，本次运行停止；请人工核对后恢复。', 'PROVIDER_ERROR', { cause: error })
      }
    }
    // Once Send may have happened, even a typed browser/rate-limit failure is
    // no longer safe to replay automatically. Preserve the uncertainty
    // boundary before preserving the original error taxonomy.
    if (sent || error instanceof PostSendFailure) {
      throw new LlmError(
        `ChatGPT Web outcome is uncertain after Send; the provider will not resend automatically. ${error instanceof Error ? error.message : String(error)}`,
        'PROVIDER_ERROR',
        { cause: error },
      )
    }
    if (error instanceof LlmError) throw error
    throw new LlmError(
      `ChatGPT Web turn failed before Send: ${error instanceof Error ? error.message : String(error)}`,
      'TRANSPORT',
      { cause: error },
    )
  }
}
