import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import LlmRuntime, {
  LlmAdapter,
  createUserMessage,
  type GenerateOptions,
  type StreamChunk,
} from '@deepseek-ai/dsh-llm'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime, { defineContentToolFixture } from '@deepseek-ai/dsh-tools'
import AgentRegistry, { type Agent } from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import { reasoningResultChunks } from '../src/reasoning-result.ts'

class CandidateAdapter extends LlmAdapter {
  readonly requests: GenerateOptions[] = []
  private step = 0

  override stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    this.requests.push(options)
    const chunks = this.step++ === 0
      ? reasoningResultChunks({
          type: 'action_proposal',
          action: 'echo',
          arguments: { text: 'ping' },
        }, options.tools)
      : reasoningResultChunks({ type: 'final', content: 'tool result accepted' }, options.tools)

    return (async function* () {
      for (const chunk of chunks) yield chunk
    })()
  }
}

class FailingAdapter extends LlmAdapter {
  override stream(): AsyncIterable<StreamChunk> {
    return (async function* (): AsyncGenerator<StreamChunk> {
      throw new Error('dedicated browser failed before composer readiness')
    })()
  }
}


async function runAndObserve(
  ctx: Context,
  agent: Agent,
  start: () => void,
): Promise<{ statuses: string[]; errors: unknown[] }> {
  const statuses: string[] = []
  const errors: unknown[] = []
  const stopStatus = ctx.on('agent/status', ({ agent: subject, status }) => {
    if (subject === agent) statuses.push(status)
  })
  const stopError = ctx.on('agent/error', ({ agent: subject, error }) => {
    if (subject === agent) errors.push(error)
  })
  try {
    start()
    await agent.whenIdle()
    return { statuses, errors }
  } finally {
    stopStatus()
    stopError()
  }
}

async function createHarness(adapter: LlmAdapter): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(LlmRuntime)
  await ctx.plugin(SessionStore)
  await ctx.plugin(SessionProjectionRegistry)
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(AgentLoop, { agents: [] })
  ctx.llm.registerAdapter(['candidate'], adapter)
  return ctx
}

const contexts: Context[] = []
afterEach(async () => {
  while (contexts.length > 0) await contexts.pop()?.fiber.dispose()
})

describe('DSH 0.1.5-rc.2 native tool-loop compatibility', () => {
  it('executes our native tool-call chunks and feeds the result into the second inference', async () => {
    const adapter = new CandidateAdapter()
    const ctx = await createHarness(adapter)
    contexts.push(ctx)

    let executions = 0
    ctx.tools.register(defineContentToolFixture({
      name: 'echo',
      description: 'Return the supplied text.',
      parameters: {
        text: { type: 'string', required: true },
      },
      async execute({ text }) {
        executions += 1
        return [{ type: 'text', text: `echo:${text}` }]
      },
    }))

    const agent = await ctx.agentLoop.create(SessionId('penrix-m1-native-tool-loop'), {
      provider: 'candidate',
      model: 'candidate-model',
    })
    const observation = await runAndObserve(ctx, agent, () => {
      agent.followup(createUserMessage({
        content: [{ type: 'text', text: 'Use echo, then answer.' }],
        source: { kind: 'user' },
      }))
    })
    expect(observation.statuses).toEqual(['running', 'idle'])
    expect(observation.errors).toEqual([])

    expect(executions).toBe(1)
    expect(adapter.requests).toHaveLength(2)
    expect(adapter.requests[0]?.tools?.some(tool => tool.name === 'echo')).toBe(true)

    const second = adapter.requests[1]
    expect(second?.messages.some(message => message.source.kind === 'tool')).toBe(true)
    expect(second?.messages.some(message => message.content.some(block =>
      block.type === 'tool-result'
      && block.content.some(item => item.type === 'text' && item.text === 'echo:ping'),
    ))).toBe(true)

    const events = agent.session.snapshotEvents()
    expect(events.filter(event => event.type === 'tool/call')).toHaveLength(1)
    expect(events.filter(event => event.type === 'tool/result')).toHaveLength(1)
    expect(events.filter(event => event.type === 'assistant/message')).toHaveLength(2)
  })

  it('surfaces a provider failure on agent/error before any zero-tool assertion', async () => {
    const ctx = await createHarness(new FailingAdapter())
    contexts.push(ctx)

    let executions = 0
    ctx.tools.register(defineContentToolFixture({
      name: 'echo',
      description: 'Return the supplied text.',
      parameters: {
        text: { type: 'string', required: true },
      },
      async execute({ text }) {
        executions += 1
        return [{ type: 'text', text: `echo:${text}` }]
      },
    }))

    const agent = await ctx.agentLoop.create(SessionId('penrix-m1-provider-failure'), {
      provider: 'candidate',
      model: 'candidate-model',
    })
    const observation = await runAndObserve(ctx, agent, () => {
      agent.followup(createUserMessage({
        content: [{ type: 'text', text: 'Use echo, then answer.' }],
        source: { kind: 'user' },
      }))
    })

    expect(observation.statuses).toEqual(['running', 'idle'])
    expect(observation.errors).toHaveLength(1)
    expect(observation.errors[0]).toBeInstanceOf(Error)
    expect((observation.errors[0] as Error).message).toContain('dedicated browser failed before composer readiness')
    expect(executions).toBe(0)
  })
})
