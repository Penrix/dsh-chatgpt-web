import { describe, expect, it } from 'vitest'
import { CHATGPT_ASSISTANT_TURN_SELECTOR } from '../src/chatgpt/session.ts'

function selectorClauses(selector: string): string[] {
  return selector.split(',').map(clause => clause.trim()).filter(Boolean)
}

describe('ChatGPT direct assistant reply detection', () => {
  it('matches the current direct assistant message node without requiring a conversation-turn wrapper', () => {
    const fixture = {
      tag: 'div',
      attributes: {
        'data-message-author-role': 'assistant',
      },
      markdownText: 'VISIBLE_REPLY',
      parent: {
        tag: 'main',
        attributes: {},
      },
    }

    const clauses = selectorClauses(CHATGPT_ASSISTANT_TURN_SELECTOR)
    const directAssistantSelector = '[data-message-author-role="assistant"]'

    // The captured runtime shape is the assistant node itself. It deliberately
    // has no conversation-turn-* / data-turn=assistant wrapper.
    expect(fixture.parent.attributes).not.toHaveProperty('data-testid')
    expect(fixture.parent.attributes).not.toHaveProperty('data-turn')

    const detected = clauses.includes(directAssistantSelector)
      && fixture.attributes['data-message-author-role'] === 'assistant'
    expect(detected).toBe(true)

    // Once the direct node is the selected turn, the existing extraction path
    // can read its .markdown answer body instead of waiting indefinitely.
    const extracted = detected ? fixture.markdownText : ''
    expect(extracted).toBe('VISIBLE_REPLY')
  })
})
