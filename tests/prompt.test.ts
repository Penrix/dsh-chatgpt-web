import { describe, expect, it } from 'vitest'
import { MessageId, ToolCallId } from '@deepseek-ai/dsh-llm'
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

function toolResultMessage(id: string, callId: string, text: string): Message {
  const brandedCallId = ToolCallId(callId)
  return {
    id: MessageId(id),
    role: 'user',
    content: [{
      type: 'tool-result',
      toolCallId: brandedCallId,
      content: [{ type: 'text', text }],
      isError: false,
    }],
    source: { kind: 'tool', callId: brandedCallId },
  }
}

function pluginMessage(id: string, text: string, form: 'snapshot' | 'notice'): Message {
  return {
    id: MessageId(id),
    role: 'user',
    content: [{ type: 'text', text }],
    source: {
      kind: 'plugin',
      plugin: 'meow-memory',
      ...(form === 'snapshot'
        ? { form, sections: [] }
        : { form, summary: text.slice(0, 40) }),
    } as Message['source'],
  }
}

function noFormPluginMessage(id: string, text: string): Message {
  return {
    id: MessageId(id),
    role: 'user',
    content: [{ type: 'text', text }],
    source: {
      kind: 'plugin',
      plugin: 'meow-memory',
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
    expect(result.text).toContain('OUTPUT PROTOCOL IS MACHINE-PARSED')
    expect(result.text).toContain('Do not add acknowledgements, labels, explanations, preambles, postambles, Markdown fences, or commentary')
    expect(result.text).toContain('Inside JSON string tokens, use standard JSON escaping only')
    expect(result.text).toContain('write action_proposal, never action\\_proposal')
    expect(result.text).toContain('DSH alone validates, authorizes, and executes')
  })

  it('places the lexical JSON contract after the complete DSH payload', () => {
    const result = compilePrompt({
      provider: 'chatgpt-web',
      model: 'chatgpt-web/high',
      messages: [message('u1', 'user', 'answer directly', 'user')],
    } satisfies GenerateOptions, 100_000)

    const closingTag = result.text.lastIndexOf('</dsh_context_json>')
    const lexicalRule = result.text.indexOf('JSON.parse on the complete assistant reply must succeed directly.')
    expect(lexicalRule).toBeGreaterThan(closingTag)
    expect(result.text).toContain('Inside JSON strings, use only valid JSON escapes:')
    expect(result.text).toContain('never write \\_, \\*, or a backslash before backticks')
    expect(result.text).toContain('Ordinary underscores and identifiers must remain unescaped.')
    expect(result.text).toContain('Do not output Markdown fences, prose before or after the JSON object, or a second JSON object.')
  })

  it('places the terminal anchor after the complete DSH payload', () => {
    const options = {
      provider: 'chatgpt-web',
      model: 'chatgpt-web/high',
      messages: [
        message('u1', 'user', 'answer from the supplied state', 'user'),
      ],
    } satisfies GenerateOptions

    const result = compilePrompt(options, 100_000)
    const closingTag = result.text.lastIndexOf('</dsh_context_json>')
    const terminalAnchor = result.text.indexOf('The complete authoritative DSH payload for this inference has already been supplied above.')
    expect(closingTag).toBeGreaterThanOrEqual(0)
    expect(terminalAnchor).toBeGreaterThan(closingTag)
    expect(result.text).toContain('Do not ask the user to provide a payload, conversation state, messages, or tool history.')
    expect(result.text).toContain('return exactly one raw JSON object as the entire answer')
  })

  it('anchors a realistic post-tool continuation after matching tool evidence', () => {
    const humanText = 'Find the saved rule and answer me.'
    const resultText = 'The saved rule says DSH owns the session.'
    const options = {
      provider: 'chatgpt-web',
      model: 'chatgpt-web/high',
      messages: [
        message('u1', 'user', humanText, 'user'),
        {
          id: MessageId('a-tool'),
          role: 'assistant',
          content: [{
            type: 'tool-call',
            id: ToolCallId('call-1'),
            name: 'memory_search',
            arguments: '{"query":"rule"}',
          }],
          source: { kind: 'model', provider: 'chatgpt-web', model: 'chatgpt-web/high' },
        },
        toolResultMessage('tr1', 'call-1', resultText),
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
    const closingTag = result.text.lastIndexOf('</dsh_context_json>')
    const continuationAnchor = result.text.indexOf('A supplied tool_call with its matching tool_result is completed DSH evidence.')
    expect(continuationAnchor).toBeGreaterThan(closingTag)
    expect(result.text).toContain('"type":"tool_call"')
    expect(result.text).toContain('"type":"tool_result"')
    expect(result.text).toContain('"tool_call_id":"call-1"')
    expect(result.text.split(humanText).length - 1).toBe(1)
    expect(result.text.split(resultText).length - 1).toBe(1)
    expect(result.text).toContain('do not request the payload again, claim the tool has not run, or repeat/re-execute the completed tool')
    expect(result.text).toContain('The same lexical JSON rules above still apply to this post-tool continuation.')
    expect(result.text).toContain('JSON.parse on the complete assistant reply must succeed directly.')
    expect(result.text).toContain('never write \\_, \\*, or a backslash before backticks')
  })
  it('keeps a tool result as evidence while retaining the human task target', () => {
    const options = {
      provider: 'chatgpt-web',
      model: 'chatgpt-web/high',
      messages: [
        message('u1', 'user', 'Find the saved rule and answer me.', 'user'),
        {
          id: MessageId('a-tool'),
          role: 'assistant',
          content: [{
            type: 'tool-call',
            id: ToolCallId('call-1'),
            name: 'memory_search',
            arguments: '{"query":"rule"}',
          }],
          source: { kind: 'model', provider: 'chatgpt-web', model: 'chatgpt-web/high' },
        },
        toolResultMessage('tr1', 'call-1', 'The saved rule says DSH owns the session.'),
      ],
    } satisfies GenerateOptions

    const result = compilePrompt(options, 100_000)
    expect(result.targetMessageIndex).toBe(0)
    expect(result.text).toContain('"kind":"tool"')
    expect(result.text).toContain('"callId":"call-1"')
    expect(result.text).toContain('The saved rule says DSH owns the session.')
  })

  it.each(['compaction', 'session-title'] as const)(
    'keeps auxiliary %s calls final-only even when DSH carries tool schemas',
    (purpose) => {
    const options = {
      provider: 'chatgpt-web',
      model: 'chatgpt-web/high',
      purpose,
      messages: [
        message('u1', 'user', 'old human request', 'user'),
        pluginMessage('compact', 'summarize the prior conversation', 'snapshot'),
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
    expect(result.text).toContain(`"purpose":"${purpose}"`)
    expect(result.text).toContain('"toolActionsAllowed":false')
    expect(result.text).toContain('Tool schemas may be present')
    expect(result.text).toContain('OUTPUT PROTOCOL IS MACHINE-PARSED')
    expect(result.text).toContain('Do not add acknowledgements, labels, explanations, preambles, postambles, Markdown fences, or commentary')
    expect(result.text).toContain('Inside JSON string tokens, use standard JSON escaping only')
    expect(result.text).toContain('write action_proposal, never action\\_proposal')
    expect(result.text).not.toContain('Decide only the next DSH assistant step.')
    expect(result.text).toContain('{"type":"final","content":"answer for this request"}')
    expect(result.text).not.toContain('A supplied tool_call with its matching tool_result is completed DSH evidence.')
    },
  )

  it('targets a meow-memory reflection/dream plugin turn when it is the actual DSH task', () => {
    const options = {
      provider: 'chatgpt-web',
      model: 'chatgpt-web/high',
      messages: [
        message('u1', 'user', 'earlier human request', 'user'),
        message('a1', 'assistant', 'earlier answer', 'model'),
        noFormPluginMessage('reflect', '[meow-memory-reflect] review this session'),
      ],
      tools: [{
        name: 'memory_remember',
        description: 'Store memory.',
        parameters: {
          type: 'object',
          properties: { content: { type: 'string' } },
          required: ['content'],
          additionalProperties: false,
        },
      }],
    } satisfies GenerateOptions

    const result = compilePrompt(options, 100_000)
    expect(result.targetMessageIndex).toBe(2)
    expect(result.text).toContain('[meow-memory-reflect]')
    expect(result.text).toContain('opaque/no-form or relay plugin message may itself be the task')
  })

  it('skips passive meow-memory snapshot/notice context when selecting the task target', () => {
    const options = {
      provider: 'chatgpt-web',
      model: 'chatgpt-web/high',
      messages: [
        message('u1', 'user', 'actual current request', 'user'),
        pluginMessage('snapshot', 'long-term memory snapshot', 'snapshot'),
        pluginMessage('notice', 'memory status notice', 'notice'),
      ],
    } satisfies GenerateOptions

    const result = compilePrompt(options, 100_000)
    expect(result.targetMessageIndex).toBe(0)
  })

  it('keeps normal no-tools calls final-only with the terminal anchor', () => {
    const options = {
      provider: 'chatgpt-web',
      model: 'chatgpt-web/high',
      messages: [message('u1', 'user', 'answer directly', 'user')],
    } satisfies GenerateOptions

    const result = compilePrompt(options, 100_000)
    expect(result.text).toContain('This request exposes no callable DSH tools.')
    expect(result.text).toContain('{"type":"final","content":"answer for this request"}')
    expect(result.text).not.toContain('{"type":"action_proposal"')
    expect(result.text.indexOf('The complete authoritative DSH payload for this inference has already been supplied above.'))
      .toBeGreaterThan(result.text.lastIndexOf('</dsh_context_json>'))
    expect(result.text).toContain('JSON.parse on the complete assistant reply must succeed directly.')
    expect(result.text).toContain('never write \\_, \\*, or a backslash before backticks')
  })
  it('keeps the lexical contract generic and free of concrete live-run markers', () => {
    const result = compilePrompt({
      provider: 'chatgpt-web',
      model: 'chatgpt-web/high',
      messages: [message('u1', 'user', 'store an identifier with underscores', 'user')],
    } satisfies GenerateOptions, 100_000)

    expect(result.text).toContain('Ordinary underscores and identifiers must remain unescaped.')
    expect(result.text).not.toContain('M2DURABLE')
    expect(result.text).not.toContain('m2-live-resume-after-m1-017')
    expect(result.text).not.toContain('fcedad33dabb882ceb49997c346044630ff66f1598a8e9295019dd27da117a7a')
  })

  it('keeps meow-memory plugin snapshots as context and still targets the real human message', () => {
    const options = {
      provider: 'chatgpt-web',
      model: 'chatgpt-web/high',
      messages: [
        message('u1', 'user', 'first human request', 'user'),
        pluginMessage('m1', '===== 长期记忆 =====\nH=Host', 'snapshot'),
        message('u2', 'user', 'actual current request', 'user'),
      ],
    } satisfies GenerateOptions

    const result = compilePrompt(options, 100_000)
    expect(result.targetMessageIndex).toBe(2)
    expect(result.text).toContain('"kind":"plugin"')
    expect(result.text).toContain('"plugin":"meow-memory"')
    expect(result.text).toContain('"form":"snapshot"')
    expect(result.text).toContain('passive context forms')
    expect(result.text).toContain('actual current request')
  })
})
