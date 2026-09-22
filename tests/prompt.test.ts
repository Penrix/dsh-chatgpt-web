import { describe, expect, it } from 'vitest'
import { MessageId } from '@deepseek-ai/dsh-llm'
import { compilePrompt } from '../src/chatgpt/prompt.ts'
import type { GenerateOptions, Message } from '@deepseek-ai/dsh-llm'

function message(id: string, role: 'user' | 'assistant', text: string, source: 'user' | 'model'): Message {
  return {
    id: MessageId(id),
    role,
    content: [{ type: 'text', text }],
    source: source === 'user'
      ? { kind: 'user' }
      : { kind: 'model', provider: 'chatgpt-web', model: 'chatgpt-web/current' },
  }
}

describe('compilePrompt', () => {
  it('ships the complete DSH-visible history and targets the newest human message', () => {
    const options = {
      provider: 'chatgpt-web',
      model: 'chatgpt-web/current',
      messages: [
        message('u1', 'user', 'first', 'user'),
        message('a1', 'assistant', 'answer', 'model'),
        message('u2', 'user', 'second', 'user'),
      ],
    } satisfies GenerateOptions

    const result = compilePrompt(options, 100_000)
    expect(result.targetMessageIndex).toBe(2)
    expect(result.text).toContain('"first"')
    expect(result.text).toContain('"answer"')
    expect(result.text).toContain('"second"')
    expect(result.text).toContain('"targetMessageIndex":2')
  })
})
