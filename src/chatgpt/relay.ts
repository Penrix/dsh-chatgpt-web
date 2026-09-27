import { randomUUID } from 'node:crypto'

export type RelayFetch = typeof fetch

export interface ChatGptRelayOptions {
  baseUrl: string
  fetchImpl?: RelayFetch
}

export interface ChatGptRelayTurn {
  model: string
  prompt: string
  maxOutputTokens: number
  signal?: AbortSignal
}

export interface ChatGptRelayResult {
  text: string
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

export function resolveRelayResponsesEndpoint(baseUrl: string): string {
  let url: URL
  try {
    url = new URL(baseUrl)
  } catch {
    throw new Error('codex-chatgpt-web relayBaseUrl must be a valid loopback HTTP URL.')
  }

  if (url.protocol !== 'http:') {
    throw new Error('codex-chatgpt-web relayBaseUrl must use http on loopback.')
  }
  if (!['127.0.0.1', 'localhost', '[::1]', '::1'].includes(url.hostname)) {
    throw new Error('codex-chatgpt-web relayBaseUrl must stay on loopback.')
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error('codex-chatgpt-web relayBaseUrl must not contain credentials, query, or fragment.')
  }

  const path = url.pathname.replace(/\/+$/, '')
  if (path === '' || path === '/') {
    url.pathname = '/v1/responses'
  } else if (path === '/v1') {
    url.pathname = '/v1/responses'
  } else if (path !== '/v1/responses') {
    throw new Error('codex-chatgpt-web relayBaseUrl must point to the local server root, /v1, or /v1/responses.')
  }
  return url.toString()
}

export function extractRelayAssistantText(body: unknown): string {
  const root = record(body)
  if (!root) throw new Error('codex-chatgpt-web relay returned a non-object response.')

  if (root.error !== undefined && root.error !== null) {
    throw new Error('codex-chatgpt-web relay returned an error response.')
  }
  if (root.status !== undefined && root.status !== 'completed') {
    throw new Error('codex-chatgpt-web relay response status is ' + String(root.status) + ', not completed.')
  }
  if (!Array.isArray(root.output)) {
    throw new Error('codex-chatgpt-web relay response has no output array.')
  }

  const parts: string[] = []
  for (const itemValue of root.output) {
    const item = record(itemValue)
    if (!item || item.type !== 'message' || item.role !== 'assistant' || item.phase === 'commentary') continue
    if (!Array.isArray(item.content)) continue
    for (const contentValue of item.content) {
      const part = record(contentValue)
      if (!part) continue
      if ((part.type === 'output_text' || part.type === 'text') && typeof part.text === 'string') {
        parts.push(part.text)
      }
    }
  }

  const text = parts.join('\n\n').trim()
  if (!text) throw new Error('codex-chatgpt-web relay completed without assistant output text.')
  return text
}

function errorSummary(raw: string): string | undefined {
  try {
    const body = record(JSON.parse(raw))
    const error = record(body?.error)
    const pieces = [
      typeof error?.type === 'string' ? error.type : undefined,
      typeof error?.code === 'string' ? error.code : undefined,
      typeof error?.message === 'string' ? error.message.replace(/\s+/g, ' ').trim().slice(0, 300) : undefined,
    ].filter((part): part is string => Boolean(part))
    return pieces.length > 0 ? pieces.join(': ') : undefined
  } catch {
    return undefined
  }
}

export function buildRelayRequest(turn: ChatGptRelayTurn): Record<string, unknown> {
  const threadId = `dsh_${randomUUID()}`
  const turnId = `turn_${randomUUID()}`
  return {
    model: turn.model,
    input: [{
      type: 'message',
      role: 'user',
      content: [{ type: 'input_text', text: turn.prompt }],
      internal_chat_message_metadata_passthrough: { turn_id: turnId },
    }],
    stream: false,
    max_output_tokens: turn.maxOutputTokens,
    prompt_cache_key: threadId,
    client_metadata: {
      'x-codex-turn-metadata': JSON.stringify({
        thread_id: threadId,
        turn_id: turnId,
      }),
    },
  }
}

export class ChatGptRelay {
  private readonly endpoint: string
  private readonly fetchImpl: RelayFetch

  constructor(options: ChatGptRelayOptions) {
    this.endpoint = resolveRelayResponsesEndpoint(options.baseUrl)
    this.fetchImpl = options.fetchImpl ?? fetch
  }

  async run(turn: ChatGptRelayTurn): Promise<ChatGptRelayResult> {
    const response = await this.fetchImpl(this.endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(buildRelayRequest(turn)),
      ...(turn.signal ? { signal: turn.signal } : {}),
    })
    const raw = await response.text()

    if (!response.ok) {
      const summary = errorSummary(raw)
      throw new Error(
        'codex-chatgpt-web relay HTTP ' + response.status + (summary ? ': ' + summary : ''),
      )
    }

    let body: unknown
    try {
      body = JSON.parse(raw)
    } catch {
      throw new Error('codex-chatgpt-web relay returned invalid JSON.')
    }

    return { text: extractRelayAssistantText(body) }
  }
}
