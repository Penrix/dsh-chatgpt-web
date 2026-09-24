/**
 * Model/effort selection on a fresh ChatGPT page.
 *
 * Mechanics derive from codex-chatgpt-web (MIT): the effort menu owns an ARIA
 * slider, moved one step per arrow key to `min + uiEffortIndex`; Luna-only
 * accounts use the Think toggle instead. The mapping from DSH model slug to
 * backend+eﬀort lives here (upstream coupled it to Codex config).
 * @module dsh-llm-chatgpt-web/chatgpt-effort
 */

import { LlmError } from '@deepseek-ai/dsh-llm'
import type { Locator, Page } from 'playwright-core'
import {
  CHATGPT_COMPOSER_SELECTOR,
  CHATGPT_EFFORT_CONTROL_SELECTOR,
  activateChatGptEffortMenu,
  waitForChatGptEffortSliderState,
} from './session.ts'
import {
  CHATGPT_WEB_LUNA_BACKEND_MODEL,
  CHATGPT_WEB_SOL_BACKEND_MODEL,
  resolveChatGptWebModelMode,
} from './model.ts'
import type { ChatGptEffortSliderObservation, ChatGptWebAccountCapabilities } from './session.ts'
import { throwIfRateLimitDialog, throwIfSessionFailureAlert } from './guards.ts'

export async function moveChatGptEffortSliderToTarget(
  page: Page,
  control: Locator,
  initial: ChatGptEffortSliderObservation,
  targetValue: number,
): Promise<ChatGptEffortSliderObservation> {
  let observation = initial
  let state = observation.state
  try {
    observation = await moveChatGptEffortSliderToTarget(page, control, observation, targetValue)
    state = observation.state
  } catch (error) {
    if (error instanceof LlmError) throw error
    throw new LlmError(
      error instanceof Error ? error.message : String(error),
      'PROVIDER_ERROR',
    )
  }
  await page.keyboard.press('Escape').catch(() => {})
  return mode.displayLabel
}
