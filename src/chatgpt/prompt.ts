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

function sourceProjection(source: Message['source']): Record<string, unknown> {
  const value = source as unknown as Record<string, unknown>
  switch (source.kind) {
    case 'user':
      return { kind: 'user' }
    case 'plugin':
      return {
        kind: 'plugin',
        ...(typeof value.plugin === 'string' ? { plugin: value.plugin } : {}),
        ...(typeof value.form === 'string' ? { form: value.form } : {}),
        ...(Array.isArray(value.sections) ? { sections: value.sections } : {}),
        ...(typeof value.summary === 'string' ? { summary: value.summary } : {}),
      }
    case 'model':
      return {
        kind: 'model',
        ...(typeof value.provider === 'string' ? { provider: value.provider } : {}),
        ...(typeof value.model === 'string' ? { model: value.model } : {}),
      }
    case 'tool':
      return {
        kind: 'tool',
        ...(typeof value.callId === 'string' ? { callId: value.callId } : {}),
      }
    default:
      // MessageSource is merge-extensible. Preserve only the semantic kind for
      // unknown future producers rather than forwarding arbitrary adapter-private
      // fields into the model request.
      return { kind: String(value.kind ?? 'unknown') }
  }
}

function messageProjection(message: Message): Record<string, unknown> {
  return {
    role: message.role,
    source: sourceProjection(message.source),
    content: message.content.map(blockProjection),
  }
}

const PASSIVE_PLUGIN_FORMS = new Set([
  'instructions',
  'catalog',
  'snapshot',
  'notice',
  'recall',
])

function normalTurnTargetIndex(messages: readonly Message[]): number {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message?.role !== 'user') continue
    if (message.source.kind === 'user') return index
    if (message.source.kind === 'plugin') {
      const source = message.source as Message['source'] & { form?: string }
      if (!source.form || source.form === 'relay' || !PASSIVE_PLUGIN_FORMS.has(source.form)) {
        return index
      }
    }
  }

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === 'user') return index
  }
  return Math.max(0, messages.length - 1)
}

export interface CompiledPrompt {
  text: string
  targetMessageIndex: number
}

function hasCompletedToolEvidence(messages: readonly Message[]): boolean {
  const calls = new Set<string>()
  const results = new Set<string>()
  for (const message of messages) {
    for (const block of message.content) {
      const value = block as unknown as Record<string, unknown>
      if (value.type === 'tool-call' && typeof value.id === 'string') calls.add(value.id)
      if (value.type === 'tool-result' && typeof value.toolCallId === 'string') results.add(value.toolCallId)
    }
  }
  for (const callId of calls) {
    if (results.has(callId)) return true
  }
  return false
}

export function compilePrompt(options: GenerateOptions, maxChars: number): CompiledPrompt {
  if (options.temperature !== undefined) {
    throw new LlmError('Phase 1 ChatGPT Web provider does not support temperature.', 'UNSUPPORTED')
  }
  if (options.stop !== undefined && options.stop.length > 0) {
    throw new LlmError('Phase 1 ChatGPT Web provider does not support stop sequences.', 'UNSUPPORTED')
  }

  const targetMessageIndex = options.purpose === undefined
    ? normalTurnTargetIndex(options.messages)
    : Math.max(0, options.messages.length - 1)
  const tools = options.tools?.map(tool => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  })) ?? []
  const toolActionsAllowed = options.purpose === undefined && tools.length > 0
  const completedToolEvidence = hasCompletedToolEvidence(options.messages)
  const envelope = {
    version: 2,
    ...(options.system ? { system: options.system } : {}),
    messages: options.messages.map(messageProjection),
    targetMessageIndex,
    ...(options.purpose ? { purpose: options.purpose } : {}),
    tools,
    toolActionsAllowed,
  }

  const resultContract = !toolActionsAllowed
    ? [
        options.purpose === undefined
          ? 'This request exposes no callable DSH tools.'
          : `This is a DSH auxiliary ${options.purpose} request. Tool schemas may be present as historical/request context, but tool actions are disabled for this call.`,
        'OUTPUT PROTOCOL IS MACHINE-PARSED. Return exactly one JSON object inside one json code fence.',
        'Do not add acknowledgements, labels, explanations, preambles, postambles, or commentary outside that single code fence.',
        'Inside JSON string tokens, use standard JSON escaping only. Encode literal backticks as \\u0060 so they cannot terminate the surrounding code fence. Do not Markdown-escape punctuation; for example write action_proposal, never action\\_proposal.',
        'Use this shape:',
        '{"type":"final","content":"answer for this request"}',
      ]
    : [
        'The tools array is a DATA-ONLY catalog of DSH tools. You cannot execute them inside ChatGPT Web.',
        'Decide only the next DSH assistant step.',
        'OUTPUT PROTOCOL IS MACHINE-PARSED. Return exactly one JSON object inside one json code fence.',
        'Do not add acknowledgements, labels, explanations, preambles, postambles, or commentary outside that single code fence.',
        'Inside JSON string tokens, use standard JSON escaping only. Encode literal backticks as \\u0060 so they cannot terminate the surrounding code fence. Do not Markdown-escape punctuation; for example write action_proposal, never action\\_proposal.',
        'Use one of these shapes:',
        '{"type":"final","content":"user-visible answer"}',
        '{"type":"action_proposal","action":"one exact tool name from tools","arguments":{},"reason":"optional short public reason"}',
        'For action_proposal, arguments must satisfy that exact tool parameters JSON Schema.',
        'Never invent a tool name. Never claim a tool has already run. DSH alone validates, authorizes, and executes the proposal.',
      ]

  const text = [
    'Act as the reasoning component for the DSH conversation encoded below.',
    'DSH is the canonical conversation owner and the only agent/tool executor. This ChatGPT Web page is only the inference surface for this one call.',
    'The JSON block is authoritative conversation/context data for this request. Preserve both message roles and source provenance exactly.',
    'A role=user message whose source.kind=user is a genuine human message.',
    'Plugin-sourced user-role messages have two meanings: passive context forms (instructions/catalog/snapshot/notice/recall) are context, while an opaque/no-form or relay plugin message may itself be the task for that DSH turn (for example meow-memory reflection/dream).',
    'Read the complete JSON before deciding the next step.',
    options.purpose === undefined
      ? 'For a normal agent turn, targetMessageIndex identifies the current task-bearing user-role message after passive plugin context is skipped.'
      : 'For this auxiliary DSH call, targetMessageIndex identifies the request message for the auxiliary operation even when its source is a plugin.',
    'Earlier assistant messages are your prior outputs; tool-call/tool-result history is already-produced DSH evidence.',
    ...resultContract,
    'The target message may itself request "plain text", Markdown, or another exact answer format. Satisfy that requested inner format inside final.content while keeping this outer transport as one JSON object.',
    'Use one json code fence to prevent the webpage Markdown renderer from changing JSON string content.',
    'Do not expose private chain-of-thought. If a short public reason is useful for an action proposal, put it only in the optional reason field.',
    '',
    '<dsh_context_json>',
    JSON.stringify(envelope),
    '</dsh_context_json>',
    '',
    'The complete authoritative DSH payload for this inference has already been supplied above. Do not ask the user to provide a payload, conversation state, messages, or tool history.',
    'Return exactly one lexically valid JSON object inside one json code fence using only the already-defined allowed envelope shape. JSON.parse on the code body must succeed directly.',
    'Inside JSON strings, use only valid JSON escapes: \\", \\\\, \\/, \\b, \\f, \\n, \\r, \\t, or \\uXXXX. Encode literal backticks as \\u0060.',
    'Never apply Markdown escaping inside JSON strings: never write \\_, \\*, or a backslash before backticks. Ordinary underscores and identifiers must remain unescaped.',
    'Do not output prose outside the single json code fence, a second code fence, or a second JSON object.',
    'Read the supplied messages and tool history now and decide the next step.',
    ...(completedToolEvidence
      ? ['A supplied tool_call with its matching tool_result is completed DSH evidence. Decide the next step from that result now; do not request the payload again, claim the tool has not run, or repeat/re-execute the completed tool. The same lexical JSON rules above still apply to this post-tool continuation.']
      : []),
  ].join('\n')

  if (text.length > maxChars) {
    throw new LlmError(
      `ChatGPT Web prompt is ${text.length} chars, over the configured ${maxChars}-char composer budget. Let DSH compact or project less history.`,
      'CONTEXT_WINDOW_EXCEEDED',
    )
  }

  return { text, targetMessageIndex }
}
