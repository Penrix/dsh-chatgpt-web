import { describe, expect, it } from 'vitest'
import type { ToolSchema } from '@deepseek-ai/dsh-llm'
import {
  parseReasoningResult,
  reasoningResultChunks,
  validateActionProposal,
} from '../src/reasoning-result.ts'

const memoryRemember: ToolSchema = {
  name: 'memory_remember',
  description: 'Store one durable memory.',
  parameters: {
    type: 'object',
    properties: {
      level: {
        type: 'string',
        enum: ['fact', 'lesson', 'rules'],
      },
      content: { type: 'string' },
      keywords: {
        type: 'array',
        items: { type: 'string' },
      },
      importance: { type: 'integer' },
    },
    required: ['level', 'content', 'keywords'],
    additionalProperties: false,
  },
}

describe('reasoning result protocol', () => {
  it('parses a final result', () => {
    expect(parseReasoningResult('{"type":"final","content":"done"}')).toEqual({
      type: 'final',
      content: 'done',
    })
  })

  it('accepts one outer JSON code fence as transport tolerance', () => {
    expect(parseReasoningResult('```json\n{"type":"final","content":"done"}\n```')).toEqual({
      type: 'final',
      content: 'done',
    })
  })

  it('accepts one unambiguous JSON object with presentation-only surrounding prose', () => {
    expect(parseReasoningResult('Here is the exact transport object:\n{"type":"final","content":"done"}\nEnd of response.')).toEqual({
      type: 'final',
      content: 'done',
    })
  })

  it('keeps escaped quotes, braces, and Windows paths inside the single JSON object string', () => {
    const raw = String.raw`Here is the object:
{"type":"final","content":"Path C:\\Users\\123, quoted \\\"{ok}\\\""}
End.`
    expect(parseReasoningResult(raw)).toEqual({
      type: 'final',
      content: 'Path C:\\Users\\123, quoted "{ok}"',
    })
  })

  it('accepts one JSON code fence even when presentation prose surrounds it', () => {
    expect(parseReasoningResult('Here is the object:\n\`\`\`json\n{"type":"final","content":"done"}\n\`\`\`\nThat is the complete object.')).toEqual({
      type: 'final',
      content: 'done',
    })
  })

  it('accepts a JSON fence without a newline before the closing fence', () => {
    expect(parseReasoningResult('\`\`\`json\n{"type":"final","content":"done"}\`\`\`')).toEqual({
      type: 'final',
      content: 'done',
    })
  })

  it('rejects multiple JSON objects as ambiguous presentation', () => {
    expect(() => parseReasoningResult(
      '{"type":"final","content":"one"}\n{"type":"final","content":"two"}',
    )).toThrow(/expected exactly one JSON object|invalid reasoning envelope presentation/i)
  })

  it('rejects JSON-like structure outside the single object', () => {
    expect(() => parseReasoningResult(
      'Wrapper [metadata] {"type":"final","content":"done"}',
    )).toThrow(/ambiguous|invalid reasoning envelope presentation/i)
  })

  it('rejects multiple fenced blocks even when one contains a valid object', () => {
    expect(() => parseReasoningResult(
      '\`\`\`json\n{"type":"final","content":"one"}\n\`\`\`\n\`\`\`json\n{"type":"final","content":"two"}\n\`\`\`',
    )).toThrow(/multiple Markdown code fences|invalid reasoning envelope presentation/i)
  })

  it('rejects non-json fence labels instead of guessing transport meaning', () => {
    expect(() => parseReasoningResult(
      '\`\`\`javascript\n{"type":"final","content":"done"}\n\`\`\`',
    )).toThrow(/fence must be unlabeled or json|invalid reasoning envelope presentation/i)
  })

  it('rejects extra final fields rather than silently ignoring them', () => {
    expect(() => parseReasoningResult('{"type":"final","content":"done","tool":"x"}'))
      .toThrow(/unsupported fields/i)
  })

  it('validates an action proposal against the exact DSH tool schema', () => {
    const result = parseReasoningResult(JSON.stringify({
      type: 'action_proposal',
      action: 'memory_remember',
      arguments: {
        level: 'lesson',
        content: 'H is Host.',
        keywords: ['H', 'Host', 'Prompt1'],
        importance: 5,
      },
    }))
    expect(result.type).toBe('action_proposal')
    if (result.type !== 'action_proposal') throw new Error('expected action proposal')

    expect(validateActionProposal(result, [memoryRemember])).toMatchObject({
      tool: memoryRemember,
    })
  })

  it('keeps meow-memory array arguments as arrays instead of stringifying fields', () => {
    const result = parseReasoningResult(JSON.stringify({
      type: 'action_proposal',
      action: 'memory_remember',
      arguments: {
        level: 'fact',
        content: 'Project uses DSH.',
        keywords: ['DSH', 'project', 'memory'],
      },
    }))
    if (result.type !== 'action_proposal') throw new Error('expected action proposal')

    const validated = validateActionProposal(result, [memoryRemember])
    expect(JSON.parse(validated.argumentsJson)).toEqual({
      level: 'fact',
      content: 'Project uses DSH.',
      keywords: ['DSH', 'project', 'memory'],
    })
  })

  it('rejects an unknown action name', () => {
    const result = parseReasoningResult(
      '{"type":"action_proposal","action":"delete_everything","arguments":{}}',
    )
    if (result.type !== 'action_proposal') throw new Error('expected action proposal')
    expect(() => validateActionProposal(result, [memoryRemember]))
      .toThrow(/unknown DSH tool/i)
  })

  it('rejects a proposal when the request exposed no tools', () => {
    const result = parseReasoningResult(
      '{"type":"action_proposal","action":"memory_remember","arguments":{}}',
    )
    if (result.type !== 'action_proposal') throw new Error('expected action proposal')
    expect(() => validateActionProposal(result, undefined))
      .toThrow(/exposed no tools/i)
  })

  it('rejects missing required tool arguments', () => {
    const result = parseReasoningResult(JSON.stringify({
      type: 'action_proposal',
      action: 'memory_remember',
      arguments: {
        level: 'lesson',
        content: 'missing keywords',
      },
    }))
    if (result.type !== 'action_proposal') throw new Error('expected action proposal')
    expect(() => validateActionProposal(result, [memoryRemember]))
      .toThrow(/keywords/i)
  })

  it('rejects additional properties when DSH schema forbids them', () => {
    const result = parseReasoningResult(JSON.stringify({
      type: 'action_proposal',
      action: 'memory_remember',
      arguments: {
        level: 'lesson',
        content: 'test',
        keywords: ['one', 'two', 'three'],
        unexpected: true,
      },
    }))
    if (result.type !== 'action_proposal') throw new Error('expected action proposal')
    expect(() => validateActionProposal(result, [memoryRemember]))
      .toThrow(/unexpected/i)
  })

  it('emits a native DSH tool-call stream and tool-calls finish', () => {
    const result = parseReasoningResult(JSON.stringify({
      type: 'action_proposal',
      action: 'memory_remember',
      arguments: {
        level: 'rules',
        content: 'DSH owns session state.',
        keywords: ['DSH', 'session', 'authority'],
      },
    }))
    const chunks = reasoningResultChunks(result, [memoryRemember])
    expect(chunks[0]).toEqual({ type: 'block-start', index: 0, blockType: 'tool-call' })
    expect(chunks.some(chunk => chunk.type === 'tool-call-delta')).toBe(true)
    expect(chunks.at(-1)).toEqual({ type: 'finish', reason: { kind: 'tool-calls' } })
  })

  it('emits a normal text stream for final answers', () => {
    const chunks = reasoningResultChunks(
      { type: 'final', content: 'finished' },
      [memoryRemember],
    )
    expect(chunks).toEqual([
      { type: 'block-start', index: 0, blockType: 'text' },
      { type: 'text-delta', index: 0, text: 'finished' },
      { type: 'block-end', index: 0, block: { type: 'text', text: 'finished' } },
      { type: 'finish', reason: { kind: 'stop' } },
    ])
  })
})
