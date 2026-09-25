import { describe, expect, it } from 'vitest'
import type { Page } from 'playwright-core'
import {
  dispatchSendFailClosed,
  dispatchTemporarySendFailClosed,
} from '../src/chatgpt/turn.ts'
import { assertTemporaryChatPage } from '../src/chatgpt/session.ts'

function urlOnlyPage(readUrl: () => string): Page {
  return { url: readUrl } as Page
}

describe('post-Send uncertainty boundary', () => {
  it('marks delivery possible before awaiting a click that later rejects', async () => {
    const order: string[] = []
    await expect(dispatchSendFailClosed(
      async () => {
        order.push('click-started')
        throw new Error('transport lost after dispatch')
      },
      () => {
        order.push('delivery-possible')
      },
    )).rejects.toThrow(/transport lost/)

    expect(order).toEqual(['delivery-possible', 'click-started'])
  })
})

describe('Temporary Chat guarded Send boundary', () => {
  it('preserves fail-closed ambiguity after a passing pre-Send guard', async () => {
    const page = urlOnlyPage(() => 'https://chatgpt.com/?temporary-chat=true')
    const order: string[] = []

    await expect(dispatchTemporarySendFailClosed(
      page,
      async () => {
        order.push('click-started')
        throw new Error('transport lost after dispatch')
      },
      () => { order.push('delivery-possible') },
      async () => { order.push('guard-passed') },
    )).rejects.toThrow(/transport lost/)

    expect(order).toEqual(['guard-passed', 'delivery-possible', 'click-started'])
  })
})

describe('Temporary Chat pre-Send boundary', () => {
  it('does not mark or click Send when the page is non-temporary', async () => {
    const page = urlOnlyPage(() => 'https://chatgpt.com/')
    let marked = false
    let clicks = 0

    await expect(dispatchTemporarySendFailClosed(
      page,
      async () => { clicks += 1 },
      () => { marked = true },
    )).rejects.toThrow(/isolated Temporary Chat surface/)

    expect(marked).toBe(false)
    expect(clicks).toBe(0)
  })

  it('catches route drift after an earlier successful Temporary Chat check', async () => {
    let currentUrl = 'https://chatgpt.com/?temporary-chat=true'
    const page = urlOnlyPage(() => currentUrl)
    let marked = false
    let clicks = 0

    await expect(assertTemporaryChatPage(page)).resolves.toBeUndefined()
    currentUrl = 'https://chatgpt.com/'

    await expect(dispatchTemporarySendFailClosed(
      page,
      async () => { clicks += 1 },
      () => { marked = true },
    )).rejects.toThrow(/isolated Temporary Chat surface/)

    expect(marked).toBe(false)
    expect(clicks).toBe(0)
  })
})
