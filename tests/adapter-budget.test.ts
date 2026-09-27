import { describe, expect, it } from 'vitest'
import { ChatGptWebAdapter } from '../src/adapter.ts'

describe('provider budget and retry metadata (no browser)', () => {
  const adapter = new ChatGptWebAdapter({ profileDir: 'unused', headed: false, loginTimeoutMs: 1,
    turnTimeoutMs: 1, composerMaxChars: 180_000, contextWindow: 12_000, maxTokens: 1_000 })
  it('honors the operator context budget rather than always taking the catalog value', async () => {
    expect((await adapter.resolveModel('chatgpt-web', 'chatgpt-web/high')).context?.contextWindow).toBe(12_000)
  })
  it('disables host automatic retries for the web route', () => {
    expect(adapter.providerRetryPolicy()).toMatchObject({ mode: 'normal', maxRetries: 0 })
  })
})
