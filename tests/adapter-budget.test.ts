import { describe, expect, it } from 'vitest'
import { ChatGptWebAdapter } from '../src/adapter.ts'

describe('provider budget and retry metadata (no browser)', () => {
  const adapter = new ChatGptWebAdapter({ profileDir: 'unused', headed: false, loginTimeoutMs: 1,
    turnTimeoutMs: 1, composerMaxChars: 180_000, contextWindow: 12_000, maxTokens: 1_000 })
  it('honors the operator context budget rather than always taking the catalog value', async () => {
    expect((await adapter.resolveModel('chatgpt-web', 'chatgpt-web/high')).context?.contextWindow).toBe(12_000)
  })
  it('uses each route\'s own context window when no operator cap is configured', async () => {
    const uncapped = new ChatGptWebAdapter({
      profileDir: 'unused',
      headed: false,
      loginTimeoutMs: 1,
      maxTokens: 1_000,
    })
    expect((await uncapped.resolveModel('chatgpt-web', 'chatgpt-web/luna')).context?.contextWindow)
      .toBe(1_050_000)
    expect((await uncapped.resolveModel('chatgpt-web', 'chatgpt-web/high')).context?.contextWindow)
      .toBe(90_000)
    expect((await uncapped.resolveModel('chatgpt-web', 'chatgpt-web/pro')).context?.contextWindow)
      .toBe(112_001)
    await uncapped.dispose()
  })
  it('disables host automatic retries for the web route', () => {
    expect(adapter.providerRetryPolicy()).toMatchObject({ mode: 'normal', maxRetries: 0 })
  })
})
