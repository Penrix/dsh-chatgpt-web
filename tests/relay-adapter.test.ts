import { describe, expect, it } from 'vitest'
import type { GenerateOptions } from '@deepseek-ai/dsh-llm'
import { ChatGptWebAdapter } from '../src/adapter.ts'
import {
  ChatGptRelay,
  extractRelayAssistantText,
  resolveRelayResponsesEndpoint,
  type RelayFetch,
} from '../src/chatgpt/relay.ts'

function responseBody(text: string): Record<string, unknown> {
  return {
    id: 'resp_test',
    object: 'response',
    status: 'completed',
    model: 'chatgpt-web/high',
    output: [{
      type: 'message',
      role: 'assistant',
      status: 'completed',
      content: [{ type: 'output_text', text, annotations: [] }],
    }],
  }
}

function fencedJson(json: string): string {
  const fence = '\x60\x60\x60'
  return [fence + 'json', json, fence].join('\n')
}

describe('codex-chatgpt-web relay seam', () => {
  it('keeps the Responses endpoint on loopback', () => {
    expect(resolveRelayResponsesEndpoint('http://127.0.0.1:17841'))
      .toBe('http://127.0.0.1:17841/v1/responses')
    expect(resolveRelayResponsesEndpoint('http://127.0.0.1:17841/v1'))
      .toBe('http://127.0.0.1:17841/v1/responses')
    expect(resolveRelayResponsesEndpoint('http://localhost:17841/v1/responses'))
      .toBe('http://localhost:17841/v1/responses')
    expect(() => resolveRelayResponsesEndpoint('https://127.0.0.1:17841/v1')).toThrow(/http on loopback/)
    expect(() => resolveRelayResponsesEndpoint('http://example.com:17841/v1')).toThrow(/stay on loopback/)
  })

  it('sends one non-streaming Responses request and returns assistant text', async () => {
    const calls: Array<{ url: string; body: Record<string, unknown>; signal?: AbortSignal | null }> = []
    const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
      calls.push({
        url: String(input),
        body: JSON.parse(String(init?.body)) as Record<string, unknown>,
        signal: init?.signal,
      })
      return Response.json(responseBody('reply text'))
    }) as RelayFetch

    const relay = new ChatGptRelay({
      baseUrl: 'http://127.0.0.1:17841/v1',
      fetchImpl,
    })
    const controller = new AbortController()
    await expect(relay.run({
      model: 'chatgpt-web/high',
      prompt: 'compiled DSH prompt',
      maxOutputTokens: 1234,
      signal: controller.signal,
    })).resolves.toEqual({ text: 'reply text' })

    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({
      url: 'http://127.0.0.1:17841/v1/responses',
      body: {
        model: 'chatgpt-web/high',
        input: 'compiled DSH prompt',
        stream: false,
        max_output_tokens: 1234,
      },
      signal: controller.signal,
    })
  })

  it('fails closed on incomplete or missing assistant output', () => {
    expect(() => extractRelayAssistantText({ status: 'in_progress', output: [] }))
      .toThrow(/not completed/)
    expect(() => extractRelayAssistantText({ status: 'completed', output: [] }))
      .toThrow(/without assistant output text/)
  })

  it('feeds relay final output through the existing DSH reasoning envelope parser', async () => {
    const fetchImpl = (async () => Response.json(responseBody(
      fencedJson('{"type":"final","content":"OK"}'),
    ))) as RelayFetch
    const adapter = new ChatGptWebAdapter({
      profileDir: 'unused',
      headed: false,
      loginTimeoutMs: 1,
      turnTimeoutMs: 1,
      composerMaxChars: 180_000,
      contextWindow: 90_000,
      maxTokens: 16_384,
      relayBaseUrl: 'http://127.0.0.1:17841/v1',
      relayFetch: fetchImpl,
    })

    const options = {
      provider: 'chatgpt-web',
      model: 'chatgpt-web/high',
      messages: [{
        role: 'user',
        content: [{ type: 'text', text: 'Reply exactly OK.' }],
        source: { kind: 'user' },
      }],
    } satisfies GenerateOptions

    const chunks = []
    for await (const chunk of adapter.stream(options)) chunks.push(chunk)
    expect(chunks.some(chunk => chunk.type === 'text-delta' && chunk.text === 'OK')).toBe(true)
    expect(chunks.at(-1)).toMatchObject({ type: 'finish', reason: { kind: 'stop' } })
  })

  it('keeps DSH as tool authority when the relay proposes an action', async () => {
    let requestBody: Record<string, unknown> | undefined
    const fetchImpl = (async (_input: string | URL | Request, init?: RequestInit) => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>
      return Response.json(responseBody(
        fencedJson('{"type":"action_proposal","action":"echo","arguments":{"text":"ping"}}'),
      ))
    }) as RelayFetch
    const adapter = new ChatGptWebAdapter({
      profileDir: 'unused',
      headed: false,
      loginTimeoutMs: 1,
      turnTimeoutMs: 1,
      composerMaxChars: 180_000,
      contextWindow: 90_000,
      maxTokens: 16_384,
      relayBaseUrl: 'http://127.0.0.1:17841/v1',
      relayFetch: fetchImpl,
    })

    const options = {
      provider: 'chatgpt-web',
      model: 'chatgpt-web/high',
      messages: [{
        role: 'user',
        content: [{ type: 'text', text: 'Use echo.' }],
        source: { kind: 'user' },
      }],
      tools: [{
        name: 'echo',
        description: 'Return supplied text.',
        parameters: {
          type: 'object',
          properties: { text: { type: 'string' } },
          required: ['text'],
          additionalProperties: false,
        },
      }],
    } satisfies GenerateOptions

    const chunks = []
    for await (const chunk of adapter.stream(options)) chunks.push(chunk)
    expect(chunks.some(chunk =>
      chunk.type === 'block-end'
      && chunk.block.type === 'tool-call'
      && chunk.block.name === 'echo'
      && chunk.block.arguments === '{"text":"ping"}',
    )).toBe(true)
    expect(requestBody?.tools).toBeUndefined()
    expect(String(requestBody?.input)).toContain('"name":"echo"')
    expect(String(requestBody?.input)).toContain('DSH alone validates, authorizes, and executes')
  })
})
