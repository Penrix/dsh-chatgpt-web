import { describe, expect, it } from 'vitest'
import { assertHighOrAboveForLiveTest } from '../scripts/live-model-policy.mjs'

describe('real ChatGPT test model policy', () => {
  it.each(['chatgpt-web/high', 'chatgpt-web/extra-high', 'chatgpt-web/pro'])('allows %s', model => {
    expect(assertHighOrAboveForLiveTest(model)).toBe(model)
  })

  it.each(['chatgpt-web/light', 'chatgpt-web/medium', 'chatgpt-web/luna', 'chatgpt-web/think'])('rejects %s', model => {
    expect(() => assertHighOrAboveForLiveTest(model)).toThrow(/High or above/)
  })
})
