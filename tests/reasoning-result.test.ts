import { describe, expect, it } from 'vitest'
import type { ToolSchema } from '@deepseek-ai/dsh-llm'
import {
  parseReasoningResult,
  reasoningResultChunks,
  validateActionProposal,
} from '../src/reasoning-result.ts'

const memorySearch = {
  name: 'memory_search',
  description: 'Search durable memory.',
  parameters: {
    type: 'object',
    properties: {
      project: { type: 'string' },
      query: { type: 'string' },
      days: { type: 'integer', minimum: 1, maximum: 3650 },
      k: { type: 'integer', minimum: 1, maximum: 50 },
      content_max: { type: 'integer', minimum: 0, maximum: 5000 },
    },
    required: ['project', 'query'],
    additionalProperties: false,
  },
} as unknown as ToolSchema

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

  it('normalizes the exact Windows-captured markdown underscore escapes', () => {
    const result = parseReasoningResult(
      String.raw`{"type":"action\_proposal","action":"echo","arguments":{"text":"M1\_LIVE\_PING"}}`,
    )
    expect(result).toEqual({
      type: 'action_proposal',
      action: 'echo',
      arguments: { text: 'M1_LIVE_PING' },
    })
  })

  it('preserves standard JSON escapes while normalizing only markdown underscore escapes', () => {
    const result = parseReasoningResult(
      String.raw`{"type":"final","content":"slash \\ quote \" newline \n path C:\\Users\\123 token M1\_LIVE"}`,
    )
    expect(result).toEqual({
      type: 'final',
      content: 'slash \\ quote " newline \n path C:\\Users\\123 token M1_LIVE',
    })
  })

  it('preserves a valid JSON-escaped literal backslash before an underscore', () => {
    const result = parseReasoningResult(
      String.raw`{"type":"final","content":"literal \\_ pair"}`,
    )
    expect(result).toEqual({
      type: 'final',
      content: 'literal \\_ pair',
    })
  })

  it('rejects unsupported invalid JSON escapes instead of guessing a repair', () => {
    expect(() => parseReasoningResult(
      String.raw`{"type":"final","content":"bad\qescape"}`,
    )).toThrow(/invalid reasoning envelope/i)
    expect(() => parseReasoningResult(
      String.raw`{"type":"final","content":"not-proven\*markdown"}`,
    )).toThrow(/invalid reasoning envelope/i)
  })

  it('normalizes the exact Windows-captured M2 structural array escapes', () => {
    const raw = String.raw`{"type":"action\_proposal","action":"memory\_remember","arguments":{"content":"M2SEED\_5ca7f302-39a4-435e-9071-24965048427c is the seed fact for WEB-M2-WIN-LIVE-008.","level":"fact","project":"m2-live-5ca7f302-39a4-435e-9071-24965048427c","importance":5,"keywords":\["M2SEED\_5ca7f302-39a4-435e-9071-24965048427c","m2-live-seed"\]},"reason":"Store the requested seed fact exactly once before answering."}`
    expect(raw).toHaveLength(404)

    const result = parseReasoningResult(raw)
    expect(result.type).toBe('action_proposal')
    if (result.type !== 'action_proposal') throw new Error('expected action proposal')

    expect(result.action).toBe('memory_remember')
    expect(result.arguments).toMatchObject({
      content: 'M2SEED_5ca7f302-39a4-435e-9071-24965048427c is the seed fact for WEB-M2-WIN-LIVE-008.',
      level: 'fact',
      project: 'm2-live-5ca7f302-39a4-435e-9071-24965048427c',
      importance: 5,
      keywords: [
        'M2SEED_5ca7f302-39a4-435e-9071-24965048427c',
        'm2-live-seed',
      ],
    })
  })

  it('does not normalize markdown bracket escapes inside JSON strings', () => {
    expect(() => parseReasoningResult(
      String.raw`{"type":"final","content":"literal \[brackets\] stay strict"}`,
    )).toThrow(/invalid reasoning envelope/i)
  })

  it('rejects unsupported structural markdown escapes other than array delimiters', () => {
    expect(() => parseReasoningResult(
      String.raw`{"type":"final","content":"done","extra":\{\}}`,
    )).toThrow(/invalid reasoning envelope/i)
    expect(() => parseReasoningResult(
      String.raw`{"type":"final","content":\*"done"}`,
    )).toThrow(/invalid reasoning envelope/i)
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
{"type":"final","content":"Path C:\\Users\\123, quoted \"{ok}\""}
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

  it('normalizes one prose-wrapped action proposal with nested arguments as one object', () => {
    const result = parseReasoningResult(
      'Proposal follows:\n{"type":"action_proposal","action":"memory_remember","arguments":{"level":"fact","content":"Nested object stays inside one envelope.","keywords":["one","two"]}}\nEnd.',
    )
    expect(result).toEqual({
      type: 'action_proposal',
      action: 'memory_remember',
      arguments: {
        level: 'fact',
        content: 'Nested object stays inside one envelope.',
        keywords: ['one', 'two'],
      },
    })
  })

  it('accepts real memory_search numeric bounds when arguments are in range', () => {
    const result = parseReasoningResult(JSON.stringify({
      type: 'action_proposal',
      action: 'memory_search',
      arguments: {
        project: 'm2-live-project',
        query: 'seed fact',
        days: 30,
        k: 10,
        content_max: 1200,
      },
    }))
    if (result.type !== 'action_proposal') throw new Error('expected action proposal')

    expect(() => validateActionProposal(result, [memorySearch])).not.toThrow()
  })

  it('rejects memory_search integers below minimum or above maximum', () => {
    for (const argumentsValue of [
      { project: 'p', query: 'q', days: 0, k: 10, content_max: 100 },
      { project: 'p', query: 'q', days: 30, k: 51, content_max: 100 },
      { project: 'p', query: 'q', days: 30, k: 10, content_max: 5001 },
    ]) {
      const result = parseReasoningResult(JSON.stringify({
        type: 'action_proposal',
        action: 'memory_search',
        arguments: argumentsValue,
      }))
      if (result.type !== 'action_proposal') throw new Error('expected action proposal')
      expect(() => validateActionProposal(result, [memorySearch])).toThrow(/greater than or equal|less than or equal/i)
    }
  })

  it('preserves integer type enforcement with numeric bounds', () => {
    const result = parseReasoningResult(JSON.stringify({
      type: 'action_proposal',
      action: 'memory_search',
      arguments: {
        project: 'p',
        query: 'q',
        days: 1.5,
      },
    }))
    if (result.type !== 'action_proposal') throw new Error('expected action proposal')

    expect(() => validateActionProposal(result, [memorySearch])).toThrow(/must be an integer/i)
  })

  it('uses numeric bounds when selecting a nested oneOf branch', () => {
    const boundedUnion = {
      name: 'bounded_union',
      description: 'Test exact-one branch selection with bounds.',
      parameters: {
        type: 'object',
        properties: {
          bucket: {
            oneOf: [
              { type: 'integer', minimum: 1, maximum: 5 },
              { type: 'integer', minimum: 10, maximum: 20 },
            ],
          },
        },
        required: ['bucket'],
        additionalProperties: false,
      },
    } as unknown as ToolSchema

    const accepted = parseReasoningResult(JSON.stringify({
      type: 'action_proposal',
      action: 'bounded_union',
      arguments: { bucket: 12 },
    }))
    if (accepted.type !== 'action_proposal') throw new Error('expected action proposal')
    expect(() => validateActionProposal(accepted, [boundedUnion])).not.toThrow()

    const rejected = parseReasoningResult(JSON.stringify({
      type: 'action_proposal',
      action: 'bounded_union',
      arguments: { bucket: 7 },
    }))
    if (rejected.type !== 'action_proposal') throw new Error('expected action proposal')
    expect(() => validateActionProposal(rejected, [boundedUnion])).toThrow(/exactly one oneOf branch/i)
  })

  it('rejects malformed numeric bounds and unrelated unsupported keywords', () => {
    const malformedSchemas = [
      {
        type: 'object',
        properties: { value: { type: 'string', minimum: 1 } },
      },
      {
        type: 'object',
        properties: { value: { type: 'integer', minimum: Number.NaN } },
      },
      {
        type: 'object',
        properties: { value: { type: 'integer', minimum: -0 } },
      },
      {
        type: 'object',
        properties: { value: { type: 'integer', minimum: 10, maximum: 2 } },
      },
      {
        type: 'object',
        properties: { value: { type: 'string', pattern: '^x
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
 } },
      },
    ]

    for (const parameters of malformedSchemas) {
      const tool = {
        name: 'malformed_bounds',
        description: 'Malformed schema fixture.',
        parameters,
      } as unknown as ToolSchema
      const result = parseReasoningResult(JSON.stringify({
        type: 'action_proposal',
        action: 'malformed_bounds',
        arguments: { value: 3 },
      }))
      if (result.type !== 'action_proposal') throw new Error('expected action proposal')
      expect(() => validateActionProposal(result, [tool])).toThrow(/unsupported JSON schema/i)
    }
  })

  it('does not mutate the raw numeric-bound schema during validation', () => {
    const before = structuredClone(memorySearch.parameters)
    const result = parseReasoningResult(JSON.stringify({
      type: 'action_proposal',
      action: 'memory_search',
      arguments: {
        project: 'p',
        query: 'q',
        days: 7,
        k: 3,
        content_max: 500,
      },
    }))
    if (result.type !== 'action_proposal') throw new Error('expected action proposal')

    validateActionProposal(result, [memorySearch])
    expect(memorySearch.parameters).toEqual(before)
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
