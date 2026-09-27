import { randomUUID } from 'node:crypto'
import { LlmError, ToolCallId } from '@deepseek-ai/dsh-llm'
import type { StreamChunk, ToolSchema } from '@deepseek-ai/dsh-llm'
import {
  prepareNumericBoundsSchema,
  validateNumericBoundsSchemaValue,
} from './numeric-bounds-schema.ts'

export type ReasoningResult =
  | { type: 'final'; content: string }
  | {
      type: 'action_proposal'
      action: string
      arguments: unknown
      reason?: string
    }

function safePresentationWrapper(text: string): boolean {
  return !/[{}\[\]`]/.test(text)
}

function balancedObjectSpans(text: string): Array<{ start: number; end: number }> {
  const spans: Array<{ start: number; end: number }> = []
  let start = -1
  let depth = 0
  let inString = false
  let escaped = false

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (start < 0) {
      if (char === '}') {
        throw new Error('unmatched closing brace outside JSON object')
      }
      if (char === '{') {
        start = index
        depth = 1
        inString = false
        escaped = false
      }
      continue
    }

    if (inString) {
      if (escaped) {
        escaped = false
      } else if (char === '\\') {
        escaped = true
      } else if (char === '"') {
        inString = false
      }
      continue
    }

    if (char === '"') {
      inString = true
    } else if (char === '{') {
      depth += 1
    } else if (char === '}') {
      depth -= 1
      if (depth === 0) {
        spans.push({ start, end: index + 1 })
        start = -1
      }
    }
  }

  if (start >= 0 || inString) throw new Error('unterminated JSON object presentation')
  return spans
}

function singleFencedJsonObject(text: string): string | undefined {
  const fence = /```([^\r\n`]*)[ \t]*\r?\n?([\s\S]*?)\r?\n?```/g
  const matches = [...text.matchAll(fence)]
  if (matches.length === 0) return undefined
  if (matches.length !== 1) throw new Error('multiple Markdown code fences are ambiguous')

  const match = matches[0]
  if (match === undefined || match.index === undefined) throw new Error('invalid Markdown fence match')
  const language = (match[1] ?? '').trim().toLowerCase()
  if (language !== '' && language !== 'json') throw new Error('reasoning envelope fence must be unlabeled or json')

  const before = text.slice(0, match.index)
  const after = text.slice(match.index + match[0].length)
  if (!safePresentationWrapper(before) || !safePresentationWrapper(after)) {
    throw new Error('JSON-like content outside the single Markdown fence is ambiguous')
  }

  return (match[2] ?? '').trim()
}

function normalizeReasoningPresentation(raw: string): string {
  const trimmed = raw.trim()
  if (trimmed.length === 0) return trimmed

  try {
    const parsed = JSON.parse(trimmed)
    if (isPlainRecord(parsed)) return trimmed
  } catch {
    // Continue with strict presentation normalization below.
  }

  const fenced = singleFencedJsonObject(trimmed)
  if (fenced !== undefined) return fenced

  const spans = balancedObjectSpans(trimmed)
  if (spans.length !== 1) {
    throw new Error(`expected exactly one JSON object presentation, found ${spans.length}`)
  }

  const span = spans[0]
  if (span === undefined) throw new Error('missing JSON object presentation')
  const before = trimmed.slice(0, span.start)
  const after = trimmed.slice(span.end)
  if (!safePresentationWrapper(before) || !safePresentationWrapper(after)) {
    throw new Error('JSON-like content outside the single object is ambiguous')
  }

  return trimmed.slice(span.start, span.end)
}

function normalizeMarkdownJsonStringEscapes(candidate: string): string {
  let result = ''
  let inString = false

  for (let index = 0; index < candidate.length; index += 1) {
    const char = candidate[index]
    if (!inString) {
      if (char === '\\') {
        const next = candidate[index + 1]
        if (next === '[' || next === ']') {
          result += next
          index += 1
          continue
        }
      }

      result += char
      if (char === '"') inString = true
      continue
    }

    if (char === '"') {
      result += char
      inString = false
      continue
    }

    if (char !== '\\') {
      result += char
      continue
    }

    const next = candidate[index + 1]
    if (next === undefined) {
      result += char
      continue
    }

    if (next === '_') {
      result += '_'
      index += 1
      continue
    }

    result += char + next
    index += 1
  }

  return result
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function parseReasoningResult(raw: string): ReasoningResult {
  let candidate: string
  try {
    candidate = normalizeMarkdownJsonStringEscapes(normalizeReasoningPresentation(raw))
  } catch (error) {
    throw new LlmError(
      'ChatGPT Web returned an invalid reasoning envelope presentation: expected exactly one JSON object.',
      'INVALID_RESPONSE',
      { cause: error },
    )
  }
  let value: unknown
  try {
    value = JSON.parse(candidate)
  } catch (error) {
    throw new LlmError(
      'ChatGPT Web returned an invalid reasoning envelope: expected one JSON object.',
      'INVALID_RESPONSE',
      { cause: error },
    )
  }

  if (!isPlainRecord(value) || typeof value.type !== 'string') {
    throw new LlmError(
      'ChatGPT Web reasoning envelope must be an object with a string type.',
      'INVALID_RESPONSE',
    )
  }

  if (value.type === 'final') {
    const allowed = new Set(['type', 'content'])
    if (Object.keys(value).some(key => !allowed.has(key))) {
      throw new LlmError(
        'final reasoning envelope contains unsupported fields.',
        'INVALID_RESPONSE',
      )
    }
    if (typeof value.content !== 'string' || value.content.trim().length === 0) {
      throw new LlmError(
        'final reasoning envelope requires non-empty string content.',
        'EMPTY_RESPONSE',
      )
    }
    return { type: 'final', content: value.content }
  }

  if (value.type === 'action_proposal') {
    const allowed = new Set(['type', 'action', 'arguments', 'reason'])
    if (Object.keys(value).some(key => !allowed.has(key))) {
      throw new LlmError(
        'action_proposal reasoning envelope contains unsupported fields.',
        'INVALID_RESPONSE',
      )
    }
    if (typeof value.action !== 'string' || value.action.length === 0) {
      throw new LlmError(
        'action_proposal requires a non-empty action name.',
        'INVALID_RESPONSE',
      )
    }
    if (!Object.hasOwn(value, 'arguments')) {
      throw new LlmError(
        'action_proposal requires an arguments value.',
        'INVALID_RESPONSE',
      )
    }
    if (value.reason !== undefined && typeof value.reason !== 'string') {
      throw new LlmError(
        'action_proposal reason must be a string when present.',
        'INVALID_RESPONSE',
      )
    }
    return {
      type: 'action_proposal',
      action: value.action,
      arguments: value.arguments,
      ...(typeof value.reason === 'string' ? { reason: value.reason } : {}),
    }
  }

  throw new LlmError(
    `Unsupported ChatGPT Web reasoning result type: ${value.type}.`,
    'INVALID_RESPONSE',
  )
}

function findTool(tools: readonly ToolSchema[], name: string): ToolSchema {
  const matches = tools.filter(tool => tool.name === name)
  if (matches.length !== 1) {
    throw new LlmError(
      matches.length === 0
        ? `ChatGPT Web proposed unknown DSH tool "${name}".`
        : `DSH exposed duplicate tool name "${name}".`,
      'INVALID_RESPONSE',
    )
  }
  return matches[0] as ToolSchema
}

export function validateActionProposal(
  result: Extract<ReasoningResult, { type: 'action_proposal' }>,
  tools: readonly ToolSchema[] | undefined,
): { tool: ToolSchema; argumentsJson: string } {
  if (tools === undefined || tools.length === 0) {
    throw new LlmError(
      `ChatGPT Web proposed DSH tool "${result.action}" but this request exposed no tools.`,
      'INVALID_RESPONSE',
    )
  }

  const tool = findTool(tools, result.action)
  const preparedSchema = prepareNumericBoundsSchema(tool.parameters)
  const violations = validateNumericBoundsSchemaValue(
    preparedSchema,
    result.arguments,
    'arguments',
  )
  if (violations.length > 0) {
    throw new LlmError(
      `ChatGPT Web proposed invalid arguments for "${tool.name}": ${violations.join('; ')}`,
      'INVALID_RESPONSE',
    )
  }

  let argumentsJson: string
  try {
    argumentsJson = JSON.stringify(result.arguments)
  } catch (error) {
    throw new LlmError(
      `ChatGPT Web proposed non-JSON arguments for "${tool.name}".`,
      'INVALID_RESPONSE',
      { cause: error },
    )
  }
  if (argumentsJson === undefined) {
    throw new LlmError(
      `ChatGPT Web proposed non-JSON arguments for "${tool.name}".`,
      'INVALID_RESPONSE',
    )
  }

  return { tool, argumentsJson }
}

export function reasoningResultChunks(
  result: ReasoningResult,
  tools: readonly ToolSchema[] | undefined,
): StreamChunk[] {
  if (result.type === 'final') {
    return [
      { type: 'block-start', index: 0, blockType: 'text' },
      { type: 'text-delta', index: 0, text: result.content },
      { type: 'block-end', index: 0, block: { type: 'text', text: result.content } },
      { type: 'finish', reason: { kind: 'stop' } },
    ]
  }

  const validated = validateActionProposal(result, tools)
  const id = ToolCallId(`chatgpt-web-${randomUUID()}`)
  return [
    { type: 'block-start', index: 0, blockType: 'tool-call' },
    {
      type: 'tool-call-delta',
      index: 0,
      id,
      name: validated.tool.name,
      argumentsDelta: validated.argumentsJson,
    },
    {
      type: 'block-end',
      index: 0,
      block: {
        type: 'tool-call',
        id,
        name: validated.tool.name,
        arguments: validated.argumentsJson,
      },
    },
    { type: 'finish', reason: { kind: 'tool-calls' } },
  ]
}
