import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import LlmRuntime, { ToolCallId } from '@deepseek-ai/dsh-llm'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import {
  WEBCODEX_READ_FILES_TOOL,
  registerWebCodexReadFilesTool,
} from '../src/webcodex/read-files.ts'
import { apply as applyPlugin } from '../src/index.ts'

const contexts: Context[] = []

afterEach(async () => {
  while (contexts.length > 0) await contexts.pop()?.fiber.dispose()
})

async function harness(fetchImpl: typeof fetch) {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  registerWebCodexReadFilesTool(ctx, {
    baseUrl: 'http://127.0.0.1:8080',
    bearerToken: 'wc_pat_test_only',
    project: 'registered-project',
    fetch: fetchImpl,
  })
  return ctx
}

function execute(ctx: Context, args: unknown) {
  return ctx.tools.execute({
    callId: ToolCallId('wc-seam-test'),
    name: WEBCODEX_READ_FILES_TOOL,
    arguments: args,
    signal: new AbortController().signal,
  })
}

describe('WebCodex read-only durable-body seam', () => {
  it('mounts the capability through the installed root plugin when webcodexRead is configured', async () => {
    const ctx = new Context()
    contexts.push(ctx)
    await ctx.plugin(LlmRuntime)
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)

    applyPlugin(ctx, {
      webcodexRead: {
        baseUrl: 'http://127.0.0.1:8080',
        bearerToken: 'wc_pat_test_only',
        project: 'registered-project',
      },
    })
    await new Promise(resolve => setTimeout(resolve, 0))

    const schema = ctx.tools.schemas().find(tool => tool.name === WEBCODEX_READ_FILES_TOOL)
    expect(schema).toBeDefined()
    expect(schema?.parameters.properties).not.toHaveProperty('project')
    expect(JSON.stringify(schema)).not.toContain('wc_pat_test_only')
  })

  it('pins the registered project and records the exact canonical structured success as the DSH value', async () => {
    const authoritative = {
      success: true,
      output: {
        project: 'registered-project',
        returned_count: 1,
        items: [{
          index: 0,
          path: 'README.md',
          success: true,
          output: {
            text: 'hello',
            start_line: 1,
            end_line: 1,
            read_revision: 17,
          },
          error: null,
        }],
      },
    }

    let request: Request | undefined
    const ctx = await harness(async (input, init) => {
      request = new Request(input, init)
      return new Response(JSON.stringify(authoritative), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    })

    const schema = ctx.tools.schemas().find(tool => tool.name === WEBCODEX_READ_FILES_TOOL)
    expect(schema).toBeDefined()
    expect(schema?.parameters.properties).not.toHaveProperty('project')
    expect(JSON.stringify(schema)).not.toContain('wc_pat_test_only')

    const result = await execute(ctx, {
      items: [{ path: 'README.md', start_line: 1, limit: 1 }],
      with_line_numbers: false,
    })

    expect(request?.url).toBe('http://127.0.0.1:8080/api/actions/read_files')
    expect(request?.headers.get('authorization')).toBe('Bearer wc_pat_test_only')
    expect(await request?.json()).toEqual({
      project: 'registered-project',
      items: [{ path: 'README.md', start_line: 1, limit: 1 }],
      with_line_numbers: false,
    })
    expect(result.isError).toBe(false)
    if (result.isError) throw new Error('expected DSH seam transport success')
    expect(result.value).toEqual(authoritative)
  })

  it('preserves a canonical WebCodex business failure and recovery output instead of rewriting it as success text', async () => {
    const authoritative = {
      success: false,
      output: {
        project: 'wc_project_resolved',
        state_changed: false,
        error_kind: 'runner_unavailable',
        retry_guidance: 'retry read_files after the owning Runner is available',
      },
      error: 'read_files could not bind the read snapshot to an active Runner process; retry after the Runner is available',
    }

    let calls = 0
    const ctx = await harness(async () => {
      calls += 1
      return new Response(JSON.stringify(authoritative), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      })
    })

    const result = await execute(ctx, {
      items: [{ path: 'README.md', start_line: 1, limit: 1 }],
    })

    expect(calls).toBe(1)
    expect(result.isError).toBe(false)
    if (result.isError) throw new Error('expected canonical WebCodex ToolResult value')
    expect(result.value).toEqual(authoritative)
    expect((result.value as typeof authoritative).success).toBe(false)
    expect((result.value as typeof authoritative).output.error_kind).toBe('runner_unavailable')
    expect((result.value as typeof authoritative).output.retry_guidance)
      .toBe('retry read_files after the owning Runner is available')
  })

  it('surfaces a non-ToolResult authorization/HTTP error as a real DSH tool failure and never retries', async () => {
    let calls = 0
    const ctx = await harness(async () => {
      calls += 1
      return new Response(JSON.stringify({ status: 403, error: 'missing required scope: project:read' }), {
        status: 403,
        headers: { 'content-type': 'application/json' },
      })
    })

    const result = await execute(ctx, {
      items: [{ path: 'README.md', start_line: 1, limit: 1 }],
    })

    expect(calls).toBe(1)
    expect(result.isError).toBe(true)
    if (!result.isError) throw new Error('expected DSH seam failure')
    expect(result.error).toEqual({
      message: 'WebCodex HTTP 403: missing required scope: project:read',
      info: { name: 'WebCodexHttpError', code: 'WEBCODEX_HTTP_ERROR' },
    })
  })
})
