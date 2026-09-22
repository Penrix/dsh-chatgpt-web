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

function pluginMessage(id: string, text: string): Message {
  return {
    id: MessageId(id),
    role: 'user',
    content: [{ type: 'text', text }],
    source: {
      kind: 'plugin',
      plugin: 'meow-memory',
      form: 'snapshot',
      sections: [],
    } as Message['source'],
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

  it('serializes exact DSH tool schemas as data and enables one-step action proposals', () => {
    const options = {
      provider: 'chatgpt-web',
      model: 'chatgpt-web/high',
      messages: [
        message('u1', 'user', 'remember this', 'user'),
      ],
      tools: [{
        name: 'memory_remember',
        description: 'Store one durable memory.',
        parameters: {
          type: 'object',
          properties: {
            content: { type: 'string' },
            keywords: { type: 'array', items: { type: 'string' } },
          },
          required: ['content', 'keywords'],
          additionalProperties: false,
        },
      }],
    } satisfies GenerateOptions

    const result = compilePrompt(options, 100_000)
    expect(result.text).toContain('"name":"memory_remember"')
    expect(result.text).toContain('"required":["content","keywords"]')
    expect(result.text).toContain('"toolActionsAllowed":true')
    expect(result.text).toContain('"type":"action_proposal"')
    expect(result.text).toContain('DSH alone validates, authorizes, and executes')
  })

  it('keeps auxiliary compaction calls final-only even when DSH carries tool schemas', () => {
    const options = {
      provider: 'chatgpt-web',
      model: 'chatgpt-web/high',
      purpose: 'compaction',
      messages: [
        message('u1', 'user', 'old human request', 'user'),
        pluginMessage('compact', 'summarize the prior conversation'),
      ],
      tools: [{
        name: 'memory_search',
        description: 'Search memory.',
        parameters: {
          type: 'object',
          properties: { query: { type: 'string' } },
          required: ['query'],
          additionalProperties: false,
        },
      }],
    } satisfies GenerateOptions

    const result = compilePrompt(options, 100_000)
    expect(result.targetMessageIndex).toBe(1)
    expect(result.text).toContain('"purpose":"compaction"')
    expect(result.text).toContain('"toolActionsAllowed":false')
    expect(result.text).toContain('Tool schemas may be present')
    expect(result.text).not.toContain('Decide only the next DSH assistant step.')
  })

  it('keeps meow-memory plugin snapshots as context and still targets the real human message', () => {
    const options = {
      provider: 'chatgpt-web',
      model: 'chatgpt-web/high',
      messages: [
        message('u1', 'user', 'first human request', 'user'),
        pluginMessage('m1', '===== 长期记忆 =====\nH=Host'),
        message('u2', 'user', 'actual current request', 'user'),
      ],
    } satisfies GenerateOptions

    const result = compilePrompt(options, 100_000)
    expect(result.targetMessageIndex).toBe(2)
    expect(result.text).toContain('"kind":"plugin"')
    expect(result.text).toContain('"plugin":"meow-memory"')
    expect(result.text).toContain('plugin-provided context')
    expect(result.text).toContain('actual current request')
  })
})
