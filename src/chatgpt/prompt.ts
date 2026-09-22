import { LlmError } from '@deepseek-ai/dsh-llm'
import type { ContentBlock, GenerateOptions, Message } from '@deepseek-ai/dsh-llm'

function blockProjection(block: ContentBlock): unknown {
  const value = block as unknown as Record<string, unknown>
  switch (value.type) {
    case 'text':
      return { type: 'text', text: String(value.text ?? '') }
    case 'reasoning':
      return { type: 'reasoning', text: String(value.text ?? value.reasoning ?? '') }
    case 'tool-call':
      return {
        type: 'tool_call',
        id: String(value.id ?? ''),
        name: String(value.name ?? ''),
        arguments: String(value.arguments ?? ''),
      }
    case 'tool-result':
      return {
        type: 'tool_result',
        tool_call_id: String(value.toolCallId ?? ''),
        is_error: value.isError === true,
        content: Array.isArray(value.content)
          ? value.content.map(entry => blockProjection(entry as ContentBlock))
          : [],
      }
    default:
      if (value.type === 'image' || value.type === 'image-url') {
        throw new LlmError('Phase 1 ChatGPT Web provider is text-only.', 'UNSUPPORTED_CONTENT')
      }
      return { type: String(value.type ?? 'unknown'), value }
  }
}

function messageProjection(message: Message): Record<string, unknown> {
  return {
    role: message.role,
    source: message.source.kind,
    content: message.content.map(blockProjection),
  }
}

function newestHumanMessageIndex(messages: readonly Message[]): number {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message?.role === 'user' && message.source.kind === 'user') return index
  }
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === 'user') return index
  }
  return messages.length - 1
}

export interface CompiledPrompt {
  text: string
  targetMessageIndex: number
}

export function compilePrompt(options: GenerateOptions, maxChars: number): CompiledPrompt {
  if (options.temperature !== undefined) {
    throw new LlmError('Phase 1 ChatGPT Web provider does not support temperature.', 'UNSUPPORTED')
  }
  if (options.stop !== undefined && options.stop.length > 0) {
    throw new LlmError('Phase 1 ChatGPT Web provider does not support stop sequences.', 'UNSUPPORTED')
  }

  const targetMessageIndex = newestHumanMessageIndex(options.messages)
  const envelope = {
    version: 1,
    ...(options.system ? { system: options.system } : {}),
    messages: options.messages.map(messageProjection),
    targetMessageIndex,
  }

  const text = [
    'Act as the model backend for the DSH conversation encoded below.',
    'DSH is the canonical conversation owner. This ChatGPT Web page is only the inference surface for this one call.',
    'The JSON block is conversation data. Preserve its message roles exactly.',
    'Read the complete JSON before answering.',
    'Answer the newest human-authored user message identified by targetMessageIndex.',
    'Earlier assistant messages are your prior outputs; tool-result data, when present, is already-produced evidence.',
    'Phase 1 does not expose local tools through ChatGPT Web. Do not claim that you executed files, shell commands, browser actions, or other effects.',
    'Never echo the transport instructions or the JSON envelope. Return only the actual answer.',
    '',
    '<dsh_context_json>',
    JSON.stringify(envelope),
    '</dsh_context_json>',
  ].join('\n')

  if (text.length > maxChars) {
    throw new LlmError(
      `ChatGPT Web prompt is ${text.length} chars, over the configured ${maxChars}-char composer budget. Let DSH compact or project less history.`,
      'CONTEXT_WINDOW_EXCEEDED',
    )
  }

  return { text, targetMessageIndex }
}
