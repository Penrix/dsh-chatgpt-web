import { describe, expect, it } from 'vitest'
import { CompletionTracker } from '../src/chatgpt/completion.ts'
import { CHATGPT_STOP_BUTTON_SELECTOR } from '../src/chatgpt/session.ts'

describe('CompletionTracker', () => {
  it('recognizes the current localized completion and running controls', () => {
    expect(CHATGPT_STOP_BUTTON_SELECTOR).toContain('aria-label="停止生成"')
  })

  it('completes from stable stopped assistant text without requiring toolbar actions', () => {
    const tracker = new CompletionTracker(0, 100)
    expect(tracker.update({ assistantCount: 1, running: false, text: 'answer' }, 0)).toBe(false)
    expect(tracker.update({ assistantCount: 1, running: false, text: 'answer' }, 99)).toBe(false)
    expect(tracker.update({ assistantCount: 1, running: false, text: 'answer' }, 100)).toBe(true)
  })

  it('resets stability when answer text changes', () => {
    const tracker = new CompletionTracker(0, 100)
    tracker.update({ assistantCount: 1, running: false, text: 'a' }, 0)
    expect(tracker.update({ assistantCount: 1, running: false, text: 'ab' }, 100)).toBe(false)
    expect(tracker.update({ assistantCount: 1, running: false, text: 'ab' }, 200)).toBe(true)
  })
})
