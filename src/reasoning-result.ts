import { randomUUID } from 'node:crypto'
import { LlmError, ToolCallId } from '@deepseek-ai/dsh-llm'
import type { StreamChunk, ToolSchema } from '@deepseek-ai/dsh-llm'
import {
  assertSupportedJsonSchema,
  validateJsonSchemaValue,
  type JsonSchemaNode,
} from '@deepseek-ai/dsh-tools'

export type ReasoningResult =
  | { type: 'final'; content: string }
  | {
      type: 'action_proposal'
      action: string
      arguments: unknown
      reason?: string
    }

function stripSingleCodeFence(text: string): string {
  const trimmed = text.trim()
  const match = /^\`\`\`(?:json)?\s*\n([\s\S]*?)\n\`\`\`$/i.exec(trimmed)
  return match?.[1]?.trim() ?? trimmed
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function parseReasoningResult(raw: string): ReasoningResult {
  const candidate = stripSingleCodeFence(raw)
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
  assertSupportedJsonSchema(tool.parameters)
  const violations = validateJsonSchemaValue(
    tool.parameters as JsonSchemaNode,
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
