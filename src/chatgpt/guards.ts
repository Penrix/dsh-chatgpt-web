/**
 * Fail-closed page guards: rate limits, expired sessions, onboarding, and
 * terminal turn errors. Selector knowledge derives from codex-chatgpt-web
 * (MIT); the implementation here is original and text-turn scoped.
 * @module dsh-llm-chatgpt-web/chatgpt-guards
 */

import { LlmError } from '@deepseek-ai/dsh-llm'
import type { Page } from 'playwright-core'
import { noteHistoryRateLimitForPage } from './browser.ts'

const HISTORY_RATE_LIMIT_TESTID = 'modal-conversation-history-rate-limit'
const HISTORY_RATE_LIMIT_PHRASES = [
  '你的请求过于频繁',
  '暂时限制你访问对话记录',
  '请稍等几分钟后再重试',
  'your requests are too frequent',
  'temporarily restricted your access to conversation history',
  'please wait a few minutes and try again',
] as const

const HISTORY_RATE_LIMIT_TEXT_SELECTOR = [
  '[role="alert"]',
  '[role="dialog"]',
  '[data-sonner-toast]',
  '[data-testid*="toast"]',
  '[aria-live="assertive"]',
  '[aria-live="polite"]',
].join(', ')

export function isHistoryRateLimitText(text: string): boolean {
  const normalized = text.toLocaleLowerCase()
  return HISTORY_RATE_LIMIT_PHRASES.some(phrase => normalized.includes(phrase))
}

export type ChatGptRateLimitClass = 'conversation-history' | 'generic-request' | 'account-warning'

export async function detectChatGptRateLimitClass(page: Page): Promise<ChatGptRateLimitClass | undefined> {
  const exactHistoryModal = page.locator(
    `#${HISTORY_RATE_LIMIT_TESTID}[data-testid="${HISTORY_RATE_LIMIT_TESTID}"], [data-testid="${HISTORY_RATE_LIMIT_TESTID}"]`,
  ).filter({ visible: true }).first()
  if (await exactHistoryModal.isVisible().catch(() => false)) return 'conversation-history'

  const semanticRegions = page.locator(HISTORY_RATE_LIMIT_TEXT_SELECTOR)
  const count = await semanticRegions.count().catch(() => 0)
  for (let index = 0; index < count; index += 1) {
    const region = semanticRegions.nth(index)
    if (!await region.isVisible().catch(() => false)) continue
    const text = await region.innerText().catch(() => '')
    if (isHistoryRateLimitText(text)) return 'conversation-history'
    if (/unusual activity|verify (?:that )?you are human|异常活动|验证你是人类|人机验证/i.test(text)) return 'account-warning'
  }

  const genericDialog = page.locator('[role="dialog"]')
    .filter({ hasText: /Too many requests/i })
    .filter({ hasText: /making requests too quickly/i })
    .last()
  if (await genericDialog.isVisible().catch(() => false)) return 'generic-request'
  return undefined
}

/** Throw RATE_LIMIT for a known visible ChatGPT limiter without dismissing it. */
export async function throwIfRateLimitDialog(page: Page): Promise<void> {
  const rateLimitClass = await detectChatGptRateLimitClass(page)
  if (!rateLimitClass) return

  if (rateLimitClass === 'conversation-history') {
    const state = noteHistoryRateLimitForPage(page)
    const remainingSeconds = Math.ceil((state?.historyCooldownRemainingMs ?? 0) / 1_000)
    throw new LlmError(
      `ChatGPT rate limit: class=conversation-history; cooldown_remaining_seconds=${remainingSeconds}.`,
      'RATE_LIMIT',
    )
  }

  throw new LlmError(
    `ChatGPT safety stop: class=${rateLimitClass}; cooldown_remaining_seconds=0.`,
    'RATE_LIMIT',
  )
}

const expiredSessionAlert = (page: Page) => page
  .locator('[role="alert"], [role="dialog"]')
  .filter({ hasText: /Your session has expired/i })
  .last()

const subscriptionAlert = (page: Page) => page
  .locator('[role="alert"]')
  .filter({ hasText: /Failed to load subscription/i })
  .last()

/** Throw AUTH when the login expired, SERVER when the subscription won't load. */
export async function throwIfSessionFailureAlert(page: Page): Promise<void> {
  if (await expiredSessionAlert(page).isVisible().catch(() => false)) {
    throw new LlmError(
      'The ChatGPT session has expired. Delete the plugin profile directory and run again to sign in.',
      'AUTH',
    )
  }
  if (!await subscriptionAlert(page).isVisible().catch(() => false)) return
  throw new LlmError(
    'ChatGPT could not load the account subscription. Reload and retry; sign in again only if it persists.',
    'SERVER',
  )
}

const temporaryChatOnboardingDialog = (page: Page) => page
  .locator('[role="dialog"]')
  .filter({ hasText: 'Not in history' })
  .filter({ hasText: 'No model training' })
  .filter({ hasText: 'Memory off' })
  .last()

/** Dismiss the first-run Temporary Chat explainer; returns whether it was shown. */
export async function dismissTemporaryChatOnboarding(page: Page): Promise<boolean> {
  const dialog = temporaryChatOnboardingDialog(page)
  if (!await dialog.isVisible().catch(() => false)) return false
  const continueButton = dialog.getByRole('button', { name: 'Continue', exact: true }).last()
  if (!await continueButton.isVisible().catch(() => false)) {
    throw new LlmError(
      'ChatGPT Temporary Chat onboarding is visible without its Continue action.',
      'PROVIDER_ERROR',
    )
  }
  await continueButton.click({ force: true })
  await dialog.waitFor({ state: 'hidden', timeout: 10_000 })
  return true
}

const terminalErrorText = (page: Page) => page
  .getByText(/Something went wrong[\s\S]*help\.openai\.com/i)
  .last()

/** Throw when the turn surface ends in a banner error instead of an answer. */
export async function throwIfTerminalError(page: Page): Promise<void> {
  if (!await terminalErrorText(page).isVisible().catch(() => false)) return
  throw new LlmError(
    "ChatGPT ended the turn with 'Something went wrong'. Retry the turn.",
    'SERVER',
  )
}
