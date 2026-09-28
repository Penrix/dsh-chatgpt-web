import { describe, expect, it } from 'vitest'
import {
  assertChatGptSurfaceUrl,
  parseChatGptEffortSliderState,
} from '../src/chatgpt/session.ts'
import {
  CHATGPT_WEB_LUNA_BACKEND_MODEL,
  CHATGPT_WEB_SOL_BACKEND_MODEL,
  resolveChatGptWebModelMode,
} from '../src/chatgpt/model.ts'
import { resolveSlugBackend } from '../src/chatgpt/effort.ts'

describe('ChatGPT model/effort mapping', () => {
  const sol = { localToolsEnabled: false, solAvailable: true, proAvailable: false }
  const pro = { localToolsEnabled: false, solAvailable: true, proAvailable: true }
  const lunaOnly = { localToolsEnabled: false, solAvailable: false, proAvailable: false }

  it('maps DSH routes to Web backends and effort levels', () => {
    expect(resolveSlugBackend('chatgpt-web/luna')).toEqual({
      backend: CHATGPT_WEB_LUNA_BACKEND_MODEL,
      effort: 'low',
    })
    expect(resolveSlugBackend('chatgpt-web/think')).toEqual({
      backend: CHATGPT_WEB_LUNA_BACKEND_MODEL,
      effort: 'medium',
    })
    expect(resolveSlugBackend('chatgpt-web/high')).toEqual({
      backend: CHATGPT_WEB_SOL_BACKEND_MODEL,
      effort: 'high',
    })
    expect(resolveSlugBackend('chatgpt-web/pro')).toEqual({
      backend: CHATGPT_WEB_SOL_BACKEND_MODEL,
      effort: 'max',
    })
  })

  it('gates Sol/Pro routes by observed account capabilities', () => {
    expect(resolveChatGptWebModelMode(CHATGPT_WEB_SOL_BACKEND_MODEL, 'high', sol).displayLabel).toBe('High')
    expect(resolveChatGptWebModelMode(CHATGPT_WEB_SOL_BACKEND_MODEL, 'max', pro).displayLabel).toBe('Pro')
    expect(() => resolveChatGptWebModelMode(CHATGPT_WEB_SOL_BACKEND_MODEL, 'max', sol)).toThrow(/Pro/)
    expect(() => resolveChatGptWebModelMode(CHATGPT_WEB_SOL_BACKEND_MODEL, 'high', lunaOnly)).toThrow(/Luna-only/)
  })

  it('rejects malformed effort slider state', () => {
    expect(parseChatGptEffortSliderState('0', '4', '2')).toEqual({ min: 0, max: 4, value: 2 })
    expect(parseChatGptEffortSliderState('0', '9', '2')).toBeUndefined()
    expect(parseChatGptEffortSliderState('0', '4', '9')).toBeUndefined()
  })

  it('keeps Temporary Chat distinct from normal connector chat', () => {
    expect(() => assertChatGptSurfaceUrl('https://chatgpt.com/?temporary-chat=true', 'temporary')).not.toThrow()
    expect(() => assertChatGptSurfaceUrl('https://chatgpt.com/?temporary-chat=true', 'connector')).toThrow()
  })
})
