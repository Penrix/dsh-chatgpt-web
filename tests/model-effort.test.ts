import { describe, expect, it } from 'vitest'
import type { Locator, Page } from 'playwright-core'
import {
  assertChatGptSurfaceUrl,
  CHATGPT_EFFORT_CONTROL_SELECTOR,
  parseChatGptEffortSliderState,
  probeChatGptEffortCapabilities,
  waitForChatGptEffortSliderState,
} from '../src/chatgpt/session.ts'
import {
  CHATGPT_WEB_LUNA_BACKEND_MODEL,
  CHATGPT_WEB_SOL_BACKEND_MODEL,
  resolveChatGptWebModelMode,
} from '../src/chatgpt/model.ts'
import { moveChatGptEffortSliderToTarget, resolveSlugBackend } from '../src/chatgpt/effort.ts'


interface FakeEffortState {
  open: boolean
  containerVisible: boolean
  sliderAttached: boolean
  clickOpens: boolean
  pointerOpens: boolean
  clicks: number
  pointers: number
  enterPresses: number
  escapes: number
  generation: number
  evaluateReads: number
  detachReadsRemaining: number
  pressDetachRemaining: number
  rawSequence: Array<{ min: string | null; max: string | null; now: string | null }>
  current: { min: string | null; max: string | null; now: string | null }
  globalSliderLookups: number
}

function fakeEffortProbe(config: Partial<FakeEffortState> = {}): {
  page: Page
  control: Locator
  state: FakeEffortState
} {
  const state: FakeEffortState = {
    open: false,
    containerVisible: false,
    sliderAttached: true,
    clickOpens: true,
    pointerOpens: false,
    clicks: 0,
    pointers: 0,
    enterPresses: 0,
    escapes: 0,
    generation: 1,
    evaluateReads: 0,
    detachReadsRemaining: 0,
    pressDetachRemaining: 0,
    rawSequence: [],
    current: { min: '0', max: '2', now: '2' },
    globalSliderLookups: 0,
    ...config,
  }

  const makeSlider = (generation: number) => {
    const slider = {
      count: async () => state.sliderAttached ? 1 : 0,
      evaluate: async () => {
        state.evaluateReads += 1
        if (generation !== state.generation || state.detachReadsRemaining > 0) {
          if (state.detachReadsRemaining > 0) {
            state.detachReadsRemaining -= 1
            state.generation += 1
          }
          throw new Error('detached')
        }
        const raw = state.rawSequence.length > 0 ? state.rawSequence.shift()! : state.current
        return { ...raw }
      },
      locator: () => ({
        press: async (key: string) => {
          if (state.pressDetachRemaining > 0) {
            state.pressDetachRemaining -= 1
            state.generation += 1
            throw new Error('detached-before-key')
          }
          const now = Number(state.current.now)
          state.current = {
            ...state.current,
            now: String(now + (key === 'ArrowRight' ? 1 : -1)),
          }
          state.generation += 1
        },
      }),
      last: () => slider,
    }
    return slider
  }

  const container = {
    isVisible: async () => state.open && state.containerVisible,
    locator: () => makeSlider(state.generation),
  }

  const ownedMenu = {
    isVisible: async () => state.open,
    locator: (selector: string) => {
      if (selector.includes('[role="slider"]')) return makeSlider(state.generation)
      if (selector.includes('data-model-reasoning-effort-slider')) return {
        filter: () => ({
          last: () => container,
        }),
      }
      throw new Error(`unexpected owned menu selector: ${selector}`)
    },
  }

  const staleGlobalContainer = {
    filter: () => ({
      last: () => {
        state.globalSliderLookups += 1
        return {
          isVisible: async () => true,
          locator: () => makeSlider(0),
        }
      },
    }),
  }

  const control = {
    getAttribute: async (name: string) => {
      if (name === 'aria-controls') return 'owned-effort-menu'
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
  }

  const page = {
    locator: (selector: string) => {
      if (selector.includes('owned-effort-menu')) return ownedMenu
      if (selector.includes('data-model-reasoning-effort-slider')) return staleGlobalContainer
      return {
        filter: () => ({
          last: () => ownedMenu,
        }),
      }
    },
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
  it('recognizes the current localized ChatGPT model button', () => {
    expect(CHATGPT_EFFORT_CONTROL_SELECTOR).toContain('aria-label="选择 ChatGPT 模型"')
    expect(CHATGPT_EFFORT_CONTROL_SELECTOR).toContain('aria-label="Choose ChatGPT model"')
  })

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

  it('uses only the newly activated control-owned slider when a stale global slider also exists', async () => {
    const probe = fakeEffortProbe()
    await expect(probeChatGptEffortCapabilities(probe.page, probe.control, {
      timeoutMs: 100,
      activationSettleMs: 5,
    })).resolves.toEqual({ solAvailable: true, proAvailable: false })
    expect(probe.state.globalSliderLookups).toBe(0)
  })

  it('recovers when the owned slider is replaced during atomic ARIA sampling', async () => {
    const probe = fakeEffortProbe({ detachReadsRemaining: 1 })
    await expect(probeChatGptEffortCapabilities(probe.page, probe.control, {
      timeoutMs: 200,
      activationSettleMs: 5,
    })).resolves.toEqual({ solAvailable: true, proAvailable: false })
    expect(probe.state.evaluateReads).toBeGreaterThanOrEqual(2)
  })

  it('recovers from transient missing or invalid ARIA before accepting the current owned slider', async () => {
    const probe = fakeEffortProbe({
      rawSequence: [
        { min: null, max: '2', now: '2' },
        { min: '0', max: '9', now: '2' },
        { min: '0', max: '2', now: '2' },
      ],
    })
    await expect(probeChatGptEffortCapabilities(probe.page, probe.control, {
      timeoutMs: 250,
      activationSettleMs: 5,
    })).resolves.toEqual({ solAvailable: true, proAvailable: false })
    expect(probe.state.evaluateReads).toBe(3)
  })

  it('semantically verifies min=0 max=2 now=2 as the current High range', async () => {
    const probe = fakeEffortProbe({
      sliderAttached: true,
      current: { min: '0', max: '2', now: '2' },
    })
    await expect(probeChatGptEffortCapabilities(probe.page, probe.control, {
      timeoutMs: 100,
      activationSettleMs: 5,
    })).resolves.toEqual({ solAvailable: true, proAvailable: false })
  })

  it('accepts the current menu-owned slider without the legacy container attribute', async () => {
    const probe = fakeEffortProbe({
      open: true,
      containerVisible: false,
      current: { min: '0', max: '2', now: '1' },
    })
    await expect(probeChatGptEffortCapabilities(probe.page, probe.control, {
      timeoutMs: 100,
      activationSettleMs: 5,
    })).resolves.toEqual({ solAvailable: true, proAvailable: false })
  })

  it('fails closed when the semantic slider is absent or its ARIA range is invalid', async () => {
    const absent = fakeEffortProbe({
      sliderAttached: false,
    })
    await expect(probeChatGptEffortCapabilities(absent.page, absent.control, {
      timeoutMs: 10,
      activationSettleMs: 1,
    })).rejects.toThrow(/slider-unattached/i)

    const invalid = fakeEffortProbe({
      sliderAttached: true,
      current: { min: '0', max: '9', now: '2' },
    })
    await expect(probeChatGptEffortCapabilities(invalid.page, invalid.control, {
      timeoutMs: 10,
      activationSettleMs: 1,
    })).rejects.toThrow(/aria-range-too-large-or-empty/i)
  })

  it('distinguishes an out-of-range current value from an oversized range', async () => {
    const probe = fakeEffortProbe({
      open: true,
      containerVisible: true,
      current: { min: '0', max: '2', now: '9' },
    })
    await expect(waitForChatGptEffortSliderState(probe.page, probe.control, 10))
      .rejects.toThrow(/aria-value-out-of-range/i)
  })

  it('fails only after the bounded wait and reports safe ARIA diagnostics for persistent invalid state', async () => {
    const probe = fakeEffortProbe({
      open: true,
      containerVisible: true,
      current: { min: '0', max: '99', now: '2' },
    })
    const started = Date.now()
    await expect(waitForChatGptEffortSliderState(probe.page, probe.control, 55))
      .rejects.toThrow(/aria-range-too-large-or-empty\(min="0",max="99",now="2"\)/i)
    expect(Date.now() - started).toBeGreaterThanOrEqual(50)
  })

  it('re-resolves and retries when the slider is replaced at keyboard dispatch time', async () => {
    const probe = fakeEffortProbe({
      open: true,
      containerVisible: true,
      pressDetachRemaining: 1,
      current: { min: '0', max: '2', now: '0' },
    })
    const initial = await waitForChatGptEffortSliderState(probe.page, probe.control, 100)
    const final = await moveChatGptEffortSliderToTarget(probe.page, probe.control, initial, 2)
    expect(final.state).toEqual({ min: 0, max: 2, value: 2 })
    expect(probe.state.pressDetachRemaining).toBe(0)
  })

  it('re-resolves the owned slider after keyboard movement replaces the DOM node', async () => {
    const probe = fakeEffortProbe({
      open: true,
      containerVisible: true,
      current: { min: '0', max: '2', now: '0' },
    })
    const initial = await waitForChatGptEffortSliderState(probe.page, probe.control, 100)
    const final = await moveChatGptEffortSliderToTarget(probe.page, probe.control, initial, 2)
    expect(final.state).toEqual({ min: 0, max: 2, value: 2 })
    expect(probe.state.generation).toBeGreaterThan(1)
  })

  it('keeps Temporary Chat distinct from normal connector chat', () => {
    expect(() => assertChatGptSurfaceUrl('https://chatgpt.com/?temporary-chat=true', 'temporary')).not.toThrow()
    expect(() => assertChatGptSurfaceUrl('https://chatgpt.com/?temporary-chat=true', 'connector')).toThrow()
  })
})
