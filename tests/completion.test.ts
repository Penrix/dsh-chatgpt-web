import { describe, expect, it } from 'vitest'
import { CompletionTracker } from '../src/chatgpt/completion.ts'

describe('CompletionTracker', () => {
  it('requires a new assistant, a new copy action, stopped generation and stability', () => {
    const tracker = new CompletionTracker(0, 0, 100)
    expect(tracker.update({ assistantCount: 1, copyActionCount: 1, running: false, text: 'answer' }, 0)).toBe(false)
    expect(tracker.update({ assistantCount: 1, copyActionCount: 1, running: false, text: 'answer' }, 99)).toBe(false)
    expect(tracker.update({ assistantCount: 1, copyActionCount: 1, running: false, text: 'answer' }, 100)).toBe(true)
  })

  it('resets stability when answer text changes', () => {
    const tracker = new CompletionTracker(0, 0, 100)
    tracker.update({ assistantCount: 1, copyActionCount: 1, running: false, text: 'a' }, 0)
    expect(tracker.update({ assistantCount: 1, copyActionCount: 1, running: false, text: 'ab' }, 100)).toBe(false)
    expect(tracker.update({ assistantCount: 1, copyActionCount: 1, running: false, text: 'ab' }, 200)).toBe(true)
  })
})
