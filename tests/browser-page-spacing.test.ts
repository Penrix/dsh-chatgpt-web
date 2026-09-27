import { describe, expect, it, vi } from 'vitest'
import type { BrowserContext, Locator, Page } from 'playwright-core'
import type { SendSafetyLease } from '../src/chatgpt/send-safety.ts'

const fakes = vi.hoisted(() => ({
  events: [] as string[],
  loginPage: undefined as Page | undefined,
  turnPages: [] as Page[],
}))

vi.mock('playwright-core', () => ({
  chromium: {
    launchPersistentContext: async () => {
      fakes.events.push('launch')
      return {
        pages: () => [fakes.loginPage!],
        newPage: async () => {
          fakes.events.push('new-page')
          return fakes.turnPages.shift()!
        },
        close: async () => {},
      } as unknown as BrowserContext
    },
  },
}))

import { ChatGptBrowser } from '../src/chatgpt/browser.ts'

function visibleLocator(): Locator {
  const locator = {
    first: () => locator,
    nth: () => locator,
    count: async () => 1,
    isVisible: async () => true,
  }
  return locator as unknown as Locator
}

function page(name: string, login = false): Page {
  return {
    goto: async () => { fakes.events.push(`goto-${name}`); return null },
    locator: () => visibleLocator(),
    close: async () => {},
    ...(login ? { waitForTimeout: async () => {} } : {}),
  } as unknown as Page
}

describe('ChatGptBrowser durable page spacing', () => {
  it('reserves every ChatGPT page, including browser startup, before opening it', async () => {
    fakes.events.length = 0
    fakes.loginPage = page('login', true)
    const firstTurn = page('turn-1')
    fakes.turnPages = [firstTurn]
    const safety = {
      reserveFreshPage: async () => { fakes.events.push('reserve') },
    } as SendSafetyLease
    const browser = new ChatGptBrowser({
      profileDir: 'unused',
      chromeExecutablePath: process.execPath,
      headed: false,
      loginTimeoutMs: 1,
    })

    await expect(browser.newTurnPage(safety)).resolves.toBe(firstTurn)
    expect(fakes.events).toEqual([
      'reserve', 'launch', 'goto-login', 'reserve', 'new-page',
    ])
    await browser.close()
  })
})
