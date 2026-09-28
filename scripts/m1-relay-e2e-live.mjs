import { randomUUID } from 'node:crypto'
import { Context } from '@deepseek-ai/cordis'
import LlmRuntime, {
  LlmAdapter,
  createUserMessage,
} from '@deepseek-ai/dsh-llm'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime, { defineContentToolFixture } from '@deepseek-ai/dsh-tools'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import { ChatGptWebAdapter, SendSafetyLease } from '../lib/index.js'

const relayBaseUrl = process.env.CODEX_CHATGPT_WEB_BASE_URL?.trim() || 'http://127.0.0.1:17841/v1'
const model = process.env.DSH_CHATGPT_WEB_MODEL?.trim() || 'chatgpt-web/high'

if (!['chatgpt-web/high', 'chatgpt-web/extra-high', 'chatgpt-web/pro'].includes(model)) {
  throw new Error('M1 relay E2E live acceptance requires chatgpt-web/high or stronger.')
}

const endpoint = new URL('/v1/responses', relayBaseUrl)
const preflight = await fetch(endpoint, { method: 'GET' })
if (preflight.status !== 426) {
  throw new Error('M1 relay E2E preflight expected HTTP 426, got ' + preflight.status)
}
await preflight.body?.cancel().catch(() => {})

const inner = new ChatGptWebAdapter({
  profileDir: 'relay-unused',
  headed: false,
  loginTimeoutMs: 1,
  turnTimeoutMs: 1,
  composerMaxChars: 180_000,
  contextWindow: 90_000,
  maxTokens: 16_384,
  relayBaseUrl,
})

const safety = await SendSafetyLease.acquire()
const requests = []
const turnTexts = []

class AcceptancePacedAdapter extends LlmAdapter {
  stream(options) {
    return this.run(options)
  }

  async *run(options) {
    const turnNumber = requests.length + 1
    if (turnNumber > 2) {
      throw new Error('M1 relay E2E attempted more than two model inferences; refusing another Web Send.')
    }

    requests.push(options)
    const chunks = []
    try {
      await safety.dispatch(async () => {
        for await (const chunk of inner.stream(options)) chunks.push(chunk)
      }, options.signal)
    } finally {
      // Acceptance-only account pacing. codex-chatgpt-web remains authoritative
      // for browser submission, retry and post-Send ambiguity.
      await safety.complete()
    }

    turnTexts.push(chunks
      .filter(chunk => chunk.type === 'text-delta')
      .map(chunk => chunk.text)
      .join(''))

    for (const chunk of chunks) yield chunk
  }
}

const ctx = new Context()
let toolExecutions = 0
const marker = 'M1_E2E_' + randomUUID()

try {
  await ctx.plugin(LlmRuntime)
  await ctx.plugin(SessionStore)
  await ctx.plugin(SessionProjectionRegistry)
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(AgentLoop, { agents: [] })

  ctx.llm.registerAdapter(['chatgpt-web'], new AcceptancePacedAdapter())

  ctx.tools.register(defineContentToolFixture({
    name: 'reveal_live_marker',
    description: 'Return the hidden live-test marker. Call this tool exactly once before giving the final answer.',
    parameters: {},
    async execute() {
      toolExecutions += 1
      return [{ type: 'text', text: marker }]
    },
  }))

  const agent = await ctx.agentLoop.create(
    SessionId('penrix-m1-relay-e2e-' + randomUUID()),
    { provider: 'chatgpt-web', model },
  )

  const errors = []
  const statuses = []
  const stopError = ctx.on('agent/error', ({ agent: subject, error }) => {
    if (subject === agent) errors.push(error)
  })
  const stopStatus = ctx.on('agent/status', ({ agent: subject, status }) => {
    if (subject === agent) statuses.push(status)
  })

  try {
    agent.followup(createUserMessage({
      content: [{
        type: 'text',
        text: [
          'This is a live end-to-end DSH tool-loop acceptance.',
          'Call the DSH tool reveal_live_marker exactly once.',
          'Do not give a final answer before the tool result exists.',
          'After DSH returns the tool result, return exactly that marker string in final.content and nothing else.',
        ].join(' '),
      }],
      source: { kind: 'user' },
    }))
    await agent.whenIdle()
  } finally {
    stopError()
    stopStatus()
  }

  if (errors.length > 0) {
    throw new Error('M1 relay E2E agent failed: ' + String(errors[0]))
  }
  if (requests.length !== 2) {
    throw new Error('M1 relay E2E expected exactly two model inferences, got ' + requests.length)
  }
  if (toolExecutions !== 1) {
    throw new Error('M1 relay E2E expected exactly one real DSH tool execution, got ' + toolExecutions)
  }

  const secondRequest = requests[1]
  const secondSawToolResult = secondRequest.messages.some(message =>
    message.role === 'tool'
    && message.content.some(block => block.type === 'text' && block.text === marker)
  )
  if (!secondSawToolResult) {
    throw new Error('M1 relay E2E second inference did not receive the real DSH tool result.')
  }

  if (turnTexts[1] !== marker) {
    throw new Error(
      'M1 relay E2E final answer did not reproduce the hidden tool marker. Got '
      + JSON.stringify(turnTexts[1]),
    )
  }

  const events = agent.session.snapshotEvents()
  const toolCalls = events.filter(event => event.type === 'tool/call').length
  const toolResults = events.filter(event => event.type === 'tool/result').length
  const assistantMessages = events.filter(event => event.type === 'assistant/message').length

  if (toolCalls !== 1 || toolResults !== 1 || assistantMessages !== 2) {
    throw new Error(
      'M1 relay E2E session evidence mismatch: '
      + JSON.stringify({ toolCalls, toolResults, assistantMessages }),
    )
  }

  process.stdout.write(JSON.stringify({
    status: 'PASS',
    evidence: 'DSH Session -> relay Web inference -> DSH tool -> tool result -> relay continuation -> final',
    relayBaseUrl,
    model,
    inferences: requests.length,
    toolExecutions,
    toolCalls,
    toolResults,
    assistantMessages,
    statuses,
    marker,
    final: turnTexts[1],
  }, null, 2) + '\n')
} finally {
  await safety.release()
  await inner.dispose()
  await ctx.fiber.dispose()
}
