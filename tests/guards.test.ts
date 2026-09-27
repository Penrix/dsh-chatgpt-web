import { describe, expect, it } from 'vitest'
import type { Locator, Page } from 'playwright-core'
import { bindPageFreshSafetyGate } from '../src/chatgpt/browser.ts'
import { FreshPageSafetyGate } from '../src/chatgpt/fresh-page-safety.ts'
import {
  detectChatGptRateLimitClass,
  isHistoryRateLimitText,
  throwIfRateLimitDialog,
} from '../src/chatgpt/guards.ts'
import { dispatchTemporarySendFailClosed } from '../src/chatgpt/turn.ts'

interface FakeRateLimitPageOptions {
  exactHistoryVisible?: boolean
  semanticTexts?: string[]
  genericVisible?: boolean
}

function locatorShape(overrides: Record<string, unknown> = {}): Locator {
  const locator: Record<string, unknown> = {
    filter: () => locator,
    first: () => locator,
    last: () => locator,
    nth: () => locator,
    count: async () => 0,
    isVisible: async () => false,
    innerText: async () => '',
    ...overrides,
  }
  return locator as unknown as Locator
}

function fakeRateLimitPage(options: FakeRateLimitPageOptions = {}): Page {
  const semanticTexts = options.semanticTexts ?? []
  const semanticCollection = locatorShape({
    count: async () => semanticTexts.length,
    nth: (index: number) => locatorShape({
      isVisible: async () => true,
      innerText: async () => semanticTexts[index] ?? '',
    }),
  })
  const exact = locatorShape({
    isVisible: async () => options.exactHistoryVisible === true,
  })
  const generic = locatorShape({
    isVisible: async () => options.genericVisible === true,
  })

  return {
    url: () => 'https://chatgpt.com/?temporary-chat=true',
    locator: (selector: string) => {
      if (selector.includes('modal-conversation-history-rate-limit')) return exact
      if (selector.includes('[data-sonner-toast]') || selector.includes('[aria-live="assertive"]')) {
        return semanticCollection
      }
      if (selector === '[role="dialog"]') return generic
      return locatorShape()
    },
  } as unknown as Page
}

describe('conversation-history rate-limit guard', () => {
  it('detects the exact history-limit testid even when generic English copy changes', async () => {
    const page = fakeRateLimitPage({ exactHistoryVisible: true })
    await expect(detectChatGptRateLimitClass(page)).resolves.toBe('conversation-history')
  })

  it('recognizes known Chinese and English semantic phrases', () => {
    expect(isHistoryRateLimitText('你的请求过于频繁，请稍等几分钟后再重试。')).toBe(true)
    expect(isHistoryRateLimitText('We temporarily restricted your access to conversation history.')).toBe(true)
    expect(isHistoryRateLimitText('Please wait a few minutes and try again.')).toBe(true)
    expect(isHistoryRateLimitText('ordinary composer notice')).toBe(false)
  })

  it('detects visible Chinese and English history-limit copy from semantic regions', async () => {
    await expect(detectChatGptRateLimitClass(fakeRateLimitPage({
      semanticTexts: ['你的请求过于频繁，请稍等几分钟后再重试。'],
    }))).resolves.toBe('conversation-history')

    await expect(detectChatGptRateLimitClass(fakeRateLimitPage({
      semanticTexts: ['Your requests are too frequent. Please wait a few minutes and try again.'],
    }))).resolves.toBe('conversation-history')
  })

  it('records a 120-second cooldown on the same bound browser safety gate', async () => {
    let now = 0
    const gate = new FreshPageSafetyGate({
      now: () => now,
      sleep: async delay => { now += delay },
    })
    const page = fakeRateLimitPage({ exactHistoryVisible: true })
    bindPageFreshSafetyGate(page, gate)

    let caught: unknown
    try {
      await throwIfRateLimitDialog(page)
    } catch (error) {
      caught = error
    }
    expect(caught).toMatchObject({ code: 'RATE_LIMIT' })
    expect(String((caught as Error).message)).toContain('class=conversation-history')
    expect(gate.state().historyCooldownRemainingMs).toBe(120_000)
  })

  it('blocks a limiter that appears before the irreversible Send boundary', async () => {
    const page = fakeRateLimitPage({ exactHistoryVisible: true })
    const gate = new FreshPageSafetyGate({ now: () => 0, sleep: async () => {} })
    bindPageFreshSafetyGate(page, gate)
    let marked = false
    let clicks = 0

    let caught: unknown
    try {
      await dispatchTemporarySendFailClosed(
        page,
        async () => { clicks += 1 },
        () => { marked = true },
        () => throwIfRateLimitDialog(page),
      )
    } catch (error) {
      caught = error
    }

    expect(caught).toMatchObject({ code: 'RATE_LIMIT' })
    expect(marked).toBe(false)
    expect(clicks).toBe(0)
  })
})
