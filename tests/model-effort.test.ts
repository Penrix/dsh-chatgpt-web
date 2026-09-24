import { describe, expect, it } from 'vitest'
import type { Locator, Page } from 'playwright-core'
import {
  assertChatGptSurfaceUrl,
  parseChatGptEffortSliderState,
  probeChatGptEffortCapabilities,
} from '../src/chatgpt/session.ts'
import {
  CHATGPT_WEB_LUNA_BACKEND_MODEL,
  CHATGPT_WEB_SOL_BACKEND_MODEL,
  resolveChatGptWebModelMode,
} from '../src/chatgpt/model.ts'
import { resolveSlugBackend } from '../src/chatgpt/effort.ts'


interface FakeEffortState {
  open: boolean
  containerVisible: boolean
  sliderAttached: boolean
  sliderReads: number
  attachAfterReads: number
  clickOpens: boolean
  pointerOpens: boolean
  clicks: number
  pointers: number
  enterPresses: number
  escapes: number
  min: string | null
  max: string | null
  now: string | null
}

function fakeEffortProbe(config: Partial<FakeEffortState> = {}): {
  page: Page
  control: Locator
  state: FakeEffortState
} {
  const state: FakeEffortState = {
    open: false,
    containerVisible: false,
    sliderAttached: false,
    sliderReads: 0,
    attachAfterReads: 0,
    clickOpens: true,
    pointerOpens: false,
    clicks: 0,
    pointers: 0,
    enterPresses: 0,
    escapes: 0,
    min: '0',
    max: '2',
    now: '2',
    ...config,
  }

  const chain = <T extends Record<string, unknown>>(value: T): T & {
    filter: () => T
    last: () => T
  } => Object.assign(value, {
    filter: () => value,
    last: () => value,
  })

  const slider = chain({
    count: async () => {
      state.sliderReads += 1
      if (state.attachAfterReads > 0 && state.sliderReads >= state.attachAfterReads) {
        state.sliderAttached = true
      }
      return state.sliderAttached ? 1 : 0
    },
    getAttribute: async (name: string) => {
      if (!state.sliderAttached) return null
      if (name === 'aria-valuemin') return state.min
      if (name === 'aria-valuemax') return state.max
      if (name === 'aria-valuenow') return state.now
      return null
    },
  })

  const container = chain({
    isVisible: async () => state.open && state.containerVisible,
    locator: () => slider,
  })

  const menu = chain({
    isVisible: async () => state.open,
  })

  const control = chain({
    getAttribute: async (name: string) => {
      if (name === 'aria-controls') return null
      if (name === 'aria-expanded') return state.open ? 'true' : 'false'
      if (name === 'data-state') return state.open ? 'open' : 'closed'
      return null
    },
    click: async () => {
      state.clicks += 1
      if (state.clickOpens) {
        state.open = true
        state.containerVisible = true
      }
    },
    dispatchEvent: async (name: string) => {
      if (name === 'pointerdown') {
        state.pointers += 1
        if (state.pointerOpens) {
          state.open = true
          state.containerVisible = true
        }
      }
    },
    press: async () => {
      state.enterPresses += 1
      throw new Error('Enter path is intentionally unavailable')
    },
  })

  const page = {
    locator: (selector: string) => selector.includes('data-model-reasoning-effort-slider')
      ? container
      : menu,
    keyboard: {
      press: async (key: string) => {
        if (key === 'Escape') {
          state.escapes += 1
          state.open = false
        }
      },
    },
  }

  return {
    page: page as unknown as Page,
    control: control as unknown as Locator,
    state,
  }
}

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


  it('uses click activation when the old Enter path is unavailable', async () => {
    const probe = fakeEffortProbe({ sliderAttached: true })
    await expect(probeChatGptEffortCapabilities(probe.page, probe.control, {
      timeoutMs: 100,
      activationSettleMs: 5,
    })).resolves.toEqual({ solAvailable: true, proAvailable: false })
    expect(probe.state.clicks).toBe(1)
    expect(probe.state.pointers).toBe(0)
    expect(probe.state.enterPresses).toBe(0)
  })

  it('falls back to pointerdown when click does not expose the effort surface', async () => {
    const probe = fakeEffortProbe({
      clickOpens: false,
      pointerOpens: true,
      sliderAttached: true,
    })
    await expect(probeChatGptEffortCapabilities(probe.page, probe.control, {
      timeoutMs: 100,
      activationSettleMs: 1,
    })).resolves.toEqual({ solAvailable: true, proAvailable: false })
    expect(probe.state.clicks).toBe(1)
    expect(probe.state.pointers).toBe(1)
    expect(probe.state.enterPresses).toBe(0)
  })

  it('waits for the semantic slider after its visible container hydrates first', async () => {
    const probe = fakeEffortProbe({
      sliderAttached: false,
      attachAfterReads: 3,
    })
    await expect(probeChatGptEffortCapabilities(probe.page, probe.control, {
      timeoutMs: 250,
      activationSettleMs: 5,
    })).resolves.toEqual({ solAvailable: true, proAvailable: false })
    expect(probe.state.sliderReads).toBeGreaterThanOrEqual(3)
  })

  it('semantically verifies min=0 max=2 now=2 as the current High range', async () => {
    const probe = fakeEffortProbe({
      sliderAttached: true,
      min: '0',
      max: '2',
      now: '2',
    })
    await expect(probeChatGptEffortCapabilities(probe.page, probe.control, {
      timeoutMs: 100,
      activationSettleMs: 5,
    })).resolves.toEqual({ solAvailable: true, proAvailable: false })
  })

  it('fails closed when the semantic slider is absent or its ARIA range is invalid', async () => {
    const absent = fakeEffortProbe({
      sliderAttached: false,
      attachAfterReads: 0,
    })
    await expect(probeChatGptEffortCapabilities(absent.page, absent.control, {
      timeoutMs: 10,
      activationSettleMs: 1,
    })).rejects.toThrow(/semantic slider did not attach/i)

    const invalid = fakeEffortProbe({
      sliderAttached: true,
      min: '0',
      max: '9',
      now: '2',
    })
    await expect(probeChatGptEffortCapabilities(invalid.page, invalid.control, {
      timeoutMs: 10,
      activationSettleMs: 1,
    })).rejects.toThrow(/invalid ARIA range/i)
  })

  it('keeps Temporary Chat distinct from normal connector chat', () => {
    expect(() => assertChatGptSurfaceUrl('https://chatgpt.com/?temporary-chat=true', 'temporary')).not.toThrow()
    expect(() => assertChatGptSurfaceUrl('https://chatgpt.com/?temporary-chat=true', 'connector')).toThrow()
  })
})
