import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import {
  WEBCODEX_READ_FILES_TOOL,
  registerWebCodexReadFilesTool,
} from '../lib/index.js'

const baseUrl = process.env.WEBCODEX_BASE_URL
const bearerToken = process.env.WEBCODEX_BEARER_TOKEN
const project = process.env.WEBCODEX_PROJECT
const file = process.env.WEBCODEX_FILE || 'README.md'
const localRoot = resolve(process.env.WEBCODEX_LOCAL_ROOT || process.cwd())
const startLine = Number(process.env.WEBCODEX_START_LINE || 1)
const limit = Number(process.env.WEBCODEX_LIMIT || 20)
const failureProject = process.env.WEBCODEX_FAILURE_PROJECT
const evidencePath = resolve(
  process.env.WEBCODEX_LIVE_EVIDENCE
    || `${tmpdir()}\\dsh-chatgpt-web-m3-live-${Date.now()}.json`,
)

for (const [name, value] of [
  ['WEBCODEX_BASE_URL', baseUrl],
  ['WEBCODEX_BEARER_TOKEN', bearerToken],
  ['WEBCODEX_PROJECT', project],
]) {
  if (!value?.trim()) throw new Error(`${name} is required for M3 Windows live acceptance.`)
}
if (!Number.isInteger(startLine) || startLine < 1) throw new Error('WEBCODEX_START_LINE must be a positive integer.')
if (!Number.isInteger(limit) || limit < 1) throw new Error('WEBCODEX_LIMIT must be a positive integer.')

const evidence = {
  packet: 'WEB-WIN-LIVE-001 / M3',
  webcodex: {
    baseUrl,
    project,
    file,
    startLine,
    limit,
    bearerToken: '<redacted>',
  },
  success: null,
  failureProbe: null,
  startedAt: new Date().toISOString(),
}

function summarizeExecution(result) {
  if (result.isError) {
    return {
      isError: true,
      error: result.error,
    }
  }
  return {
    isError: false,
    value: result.value,
  }
}

function textFromSuccess(value) {
  const output = value?.output
  const item = Array.isArray(output?.items) ? output.items[0] : undefined
  const text = item?.output?.text
  return typeof text === 'string' ? text : undefined
}

const ctx = new Context()
let disposeTool
try {
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)

  disposeTool = registerWebCodexReadFilesTool(ctx, {
    baseUrl,
    bearerToken,
    project,
  })

  const result = await ctx.tools.execute({
    callId: ToolCallId('wc-live-success'),
    name: WEBCODEX_READ_FILES_TOOL,
    arguments: {
      items: [{ path: file, start_line: startLine, limit }],
      with_line_numbers: false,
    },
    signal: new AbortController().signal,
  })

  evidence.success = summarizeExecution(result)
  assert.equal(result.isError, false, 'WebCodex live read must reach a canonical ToolResult')
  if (result.isError) throw new Error(result.error?.message || 'WebCodex DSH seam failed')
  assert.equal(result.value?.success, true, 'WebCodex canonical ToolResult must report success=true')

  const remoteText = textFromSuccess(result.value)
  assert.equal(typeof remoteText, 'string', 'WebCodex read_files success must contain item output text')

  const localPath = resolve(localRoot, file)
  const localText = await readFile(localPath, 'utf8')
  const expected = localText
    .split(/\r?\n/)
    .slice(startLine - 1, startLine - 1 + limit)
    .join('\n')
    .trimEnd()

  assert.equal(
    remoteText.trimEnd(),
    expected,
    `WebCodex structured text does not match local truth at ${localPath}`,
  )

  evidence.success.localPath = localPath
  evidence.success.localCrossCheck = 'PASS'

  if (failureProject?.trim()) {
    disposeTool()
    disposeTool = registerWebCodexReadFilesTool(ctx, {
      baseUrl,
      bearerToken,
      project: failureProject,
    })

    const failure = await ctx.tools.execute({
      callId: ToolCallId('wc-live-failure'),
      name: WEBCODEX_READ_FILES_TOOL,
      arguments: {
        items: [{ path: file, start_line: startLine, limit: 1 }],
      },
      signal: new AbortController().signal,
    })

    evidence.failureProbe = summarizeExecution(failure)
    if (!failure.isError) {
      assert.equal(
        failure.value?.success,
        false,
        'Configured failure project unexpectedly returned canonical success=true',
      )
    }
  } else {
    evidence.failureProbe = {
      skipped: true,
      reason: 'Set WEBCODEX_FAILURE_PROJECT to a known-invalid/read-failing Project id for an optional structured failure probe.',
    }
  }

  evidence.accepted = true
  evidence.completedAt = new Date().toISOString()
  await writeFile(evidencePath, JSON.stringify(evidence, null, 2) + '\n', 'utf8')
  console.log('M3 live WebCodex read: PASS (real DSH ToolRuntime -> WebCodex Server/Runner -> local truth)')
  console.log(`EVIDENCE: ${evidencePath}`)
} catch (error) {
  evidence.accepted = false
  evidence.error = error instanceof Error
    ? { name: error.name, message: error.message, stack: error.stack }
    : { message: String(error) }
  evidence.failedAt = new Date().toISOString()
  await writeFile(evidencePath, JSON.stringify(evidence, null, 2) + '\n', 'utf8').catch(() => {})
  console.error(`M3 live WebCodex read: FAIL; evidence: ${evidencePath}`)
  throw error
} finally {
  disposeTool?.()
  await ctx.fiber.dispose().catch(() => {})
}
