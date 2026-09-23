import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import LlmRuntime, { createUserMessage } from '@deepseek-ai/dsh-llm'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime, { defineContentToolFixture } from '@deepseek-ai/dsh-tools'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import { ChatGptWebAdapter } from '../lib/index.js'

const provider = 'chatgpt-web'
const model = process.env.M1_MODEL || 'chatgpt-web/high'
const profileDir = resolve(process.env.M1_PROFILE_DIR || join(homedir(), '.dsh-chatgpt-web-penrix', 'chrome-profile'))
const chromeExecutablePath = process.env.M1_CHROME_EXECUTABLE || undefined
const loginTimeoutMs = Number(process.env.M1_LOGIN_TIMEOUT_MS || 600_000)
const turnTimeoutMs = Number(process.env.M1_TURN_TIMEOUT_MS || 900_000)
const overallTimeoutMs = Number(process.env.M1_OVERALL_TIMEOUT_MS || 1_800_000)
const sessionId = SessionId(`penrix-m1-live-${Date.now()}`)
const evidencePath = resolve(process.env.M1_LIVE_EVIDENCE || join(tmpdir(), `dsh-chatgpt-web-m1-live-${Date.now()}.json`))
const profileExistedBefore = existsSync(profileDir)

function boundedReasoningEnvelopeDiagnostic(rawText, error) {
  const maxPreviewChars = 2048
  const headChars = 1536
  const tailChars = 512
  const preview = rawText.length <= maxPreviewChars
    ? rawText
    : `${rawText.slice(0, headChars)}\n…<truncated ${rawText.length - maxPreviewChars} chars>…\n${rawText.slice(-tailChars)}`
  return {
    rawLength: rawText.length,
    sha256: createHash('sha256').update(rawText, 'utf8').digest('hex'),
    startsWithBrace: rawText.trimStart().startsWith('{'),
    endsWithBrace: rawText.trimEnd().endsWith('}'),
    fenceMarkerCount: rawText.split('```').length - 1,
    preview,
    parseError: summarizeError(error),
  }
}

function summarizeError(error) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      ...(typeof error.code === 'string' ? { code: error.code } : {}),
      ...(error.stack ? { stack: error.stack } : {}),
      ...(error.cause ? { cause: summarizeError(error.cause) } : {}),
    }
  }
  return { message: String(error) }
}

function waitForAgentRun(ctx, agent, timeoutMs, lifecycle) {
  return new Promise((resolveRun, rejectRun) => {
    let settled = false
    let lastAgentError
    let disposeStatus = () => {}
    let disposeError = () => {}

    const cleanup = () => {
      disposeStatus()
      disposeError()
      clearTimeout(timer)
    }

    const finish = (error) => {
      if (settled) return
      settled = true
      cleanup()
      if (error) rejectRun(error)
      else resolveRun()
    }

    const timer = setTimeout(() => {
      finish(lastAgentError ?? new Error(`Timed out waiting for DSH AgentLoop activity after ${timeoutMs}ms.`))
    }, timeoutMs)

    lifecycle.initialStatus = agent.status

    disposeStatus = ctx.on('agent/status', ({ agent: subject, status }) => {
      if (subject !== agent) return
      lifecycle.statusTransitions.push({ status, at: new Date().toISOString() })
      if (status === 'running') lifecycle.sawRunning = true
      if (status === 'idle' && lifecycle.sawRunning) {
        finish(lastAgentError)
      }
    })

    disposeError = ctx.on('agent/error', ({ agent: subject, turn, step, error }) => {
      if (subject !== agent) return
      lastAgentError = error instanceof Error ? error : new Error(String(error))
      lifecycle.agentErrors.push({
        turn,
        step,
        error: summarizeError(error),
        at: new Date().toISOString(),
      })
    })
  })
}

const ctx = new Context()
let adapter
let agent
let echoExecutions = 0
let reasoningEnvelopeDiagnostic = null
const lifecycle = {
  initialStatus: null,
  sawRunning: false,
  statusTransitions: [],
  agentErrors: [],
}
try {
  await ctx.plugin(LlmRuntime)
  await ctx.plugin(SessionStore)
  await ctx.plugin(SessionProjectionRegistry)
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(AgentLoop, { agents: [] })

  adapter = new ChatGptWebAdapter({
    profileDir,
    ...(chromeExecutablePath ? { chromeExecutablePath } : {}),
    headed: true,
    loginTimeoutMs,
    turnTimeoutMs,
    composerMaxChars: 180_000,
    contextWindow: 90_000,
    maxTokens: 16_384,
    onReasoningEnvelopeError({ rawText, error }) {
      reasoningEnvelopeDiagnostic = boundedReasoningEnvelopeDiagnostic(rawText, error)
    },
  })
  ctx.llm.registerAdapter([provider], adapter)

  ctx.tools.register(defineContentToolFixture({
    name: 'echo',
    description: 'M1 live acceptance only: return the supplied text unchanged with an echo: prefix.',
    parameters: {
      text: { type: 'string', required: true },
    },
    async execute({ text }) {
      echoExecutions += 1
      return [{ type: 'text', text: `echo:${text}` }]
    },
  }))

  agent = await ctx.agentLoop.create(sessionId, { provider, model })
  const run = waitForAgentRun(ctx, agent, overallTimeoutMs, lifecycle)

  agent.followup(createUserMessage({
    content: [{
      type: 'text',
      text: [
        'M1 live acceptance.',
        'You must call the DSH tool named echo exactly once with text M1_LIVE_PING.',
        'After DSH returns the tool result, answer with a final response that includes M1_LIVE_OK and the exact tool result.',
        'Do not call any other tool.',
      ].join(' '),
    }],
    source: { kind: 'user' },
  }))

  await run

  const events = agent.session.snapshotEvents()
  const eventTypes = events.map(event => event.type)
  const assistantIndexes = eventTypes
    .map((type, index) => type === 'assistant/message' ? index : -1)
    .filter(index => index >= 0)
  const toolCallIndexes = eventTypes
    .map((type, index) => type === 'tool/call' ? index : -1)
    .filter(index => index >= 0)
  const toolResultIndexes = eventTypes
    .map((type, index) => type === 'tool/result' ? index : -1)
    .filter(index => index >= 0)

  assert.equal(echoExecutions, 1, 'echo must execute exactly once')
  assert.equal(toolCallIndexes.length, 1, 'Session must persist exactly one tool/call')
  assert.equal(toolResultIndexes.length, 1, 'Session must persist exactly one tool/result')
  assert.equal(assistantIndexes.length, 2, 'Session must contain exactly two assistant messages')
  assert.ok(
    assistantIndexes[0] < toolCallIndexes[0]
      && toolCallIndexes[0] < toolResultIndexes[0]
      && toolResultIndexes[0] < assistantIndexes[1],
    `unexpected Session event order: ${eventTypes.join(' -> ')}`,
  )

  const assistantEvents = events.filter(event => event.type === 'assistant/message')
  const firstToolCall = assistantEvents[0]?.data.message.content.find(block => block.type === 'tool-call')
  assert.equal(firstToolCall?.name, 'echo', 'first real inference must propose echo')
  assert.deepEqual(
    JSON.parse(firstToolCall?.arguments || '{}'),
    { text: 'M1_LIVE_PING' },
    'first real inference must propose the exact acceptance argument',
  )

  const finalText = assistantEvents[1]?.data.message.content
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('\n')
    .trim() || ''
  assert.match(finalText, /M1_LIVE_OK/, 'second real inference must include the acceptance marker')
  assert.match(finalText, /echo:M1_LIVE_PING/, 'second real inference must use the exact DSH tool result')

  assert.ok(existsSync(profileDir), 'dedicated ChatGPT provider profile must exist after a successful live run')

  const evidence = {
    packet: 'WEB-M1-WIN-LIVE-010 rev 1',
    accepted: true,
    provider,
    model,
    sessionId: String(sessionId),
    profileDir,
    profileExistedBefore,
    profileExistsAfter: existsSync(profileDir),
    lifecycle,
    reasoningEnvelopeDiagnostic,
    echoExecutions,
    counts: {
      assistantMessages: assistantIndexes.length,
      toolCalls: toolCallIndexes.length,
      toolResults: toolResultIndexes.length,
    },
    eventTypes,
    firstToolCall: firstToolCall ? { name: firstToolCall.name, arguments: firstToolCall.arguments } : null,
    finalText,
    events,
    completedAt: new Date().toISOString(),
  }

  await writeFile(
    evidencePath,
    JSON.stringify(evidence, (_, value) => typeof value === 'bigint' ? value.toString() : value, 2) + '\n',
    'utf8',
  )

  console.log('M1 live echo: PASS (real ChatGPT Web -> DSH echo -> second real inference)')
  console.log(`EVIDENCE: ${evidencePath}`)
} catch (error) {
  const events = agent?.session.snapshotEvents?.() ?? []
  const failure = {
    packet: 'WEB-M1-WIN-LIVE-010 rev 1',
    accepted: false,
    provider,
    model,
    sessionId: String(sessionId),
    profileDir,
    profileExistedBefore,
    profileExistsAfter: existsSync(profileDir),
    lifecycle,
    echoExecutions,
    eventTypes: events.map(event => event.type),
    events,
    error: summarizeError(error),
    failedAt: new Date().toISOString(),
  }
  await writeFile(
    evidencePath,
    JSON.stringify(failure, (_, value) => typeof value === 'bigint' ? value.toString() : value, 2) + '\n',
    'utf8',
  ).catch(() => {})
  console.error(`M1 live echo: FAIL; evidence: ${evidencePath}`)
  throw error
} finally {
  await adapter?.dispose().catch(() => {})
  await ctx.fiber.dispose().catch(() => {})
}
