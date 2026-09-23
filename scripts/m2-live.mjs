import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { homedir, platform, tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import LlmRuntime, { createUserMessage } from '@deepseek-ai/dsh-llm'
import SessionStore, { SessionId } from '@deepseek-ai/dsh-session'
import SessionProjectionRegistry from '@deepseek-ai/dsh-session-projection'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ToolRuntime, { defineContentToolFixture } from '@deepseek-ai/dsh-tools'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import TokenMeter from '@deepseek-ai/dsh-token-meter'
import BasicCompaction from '@deepseek-ai/dsh-compaction-basic'
import { ChatGptWebAdapter, compilePrompt } from '../lib/index.js'
import { restoreHomeEnvironment, snapshotHomeEnvironment, withTemporaryHome } from './m2-home-scope.mjs'

const PACKET = 'WEB-M2-WIN-LIVE-007 rev 1'
const SOURCE_STARTING_HEAD = '476e9b31c4c07b18ae0f45ef168816e5f3c53453'
const REFLECT_MARKER = '[meow-memory-reflect]'
const DREAM_MARKER = '[meow-memory-dream]'
const PROJECT_DIR = '.dsh-meow-live'
const runId = (process.env.M2_LIVE_RUN_ID || randomUUID()).replace(/[^a-zA-Z0-9_-]/g, '')
const model = process.env.M2_CHATGPT_MODEL || 'chatgpt-web/high'
const originalHome = homedir()
const profileDir = resolve(process.env.M2_CHATGPT_PROFILE || join(originalHome, '.dsh-chatgpt-web-penrix', 'chrome-profile'))
const workspace = resolve(process.env.M2_LIVE_WORKSPACE || join(tmpdir(), 'dsh-chatgpt-web-m2-live-' + runId))
const evidencePath = resolve(process.env.M2_LIVE_EVIDENCE || join(workspace, 'm2-live-evidence.json'))
const composerMaxChars = Number(process.env.M2_COMPOSER_MAX_CHARS || 180000)
const turnTimeoutMs = Number(process.env.M2_TURN_TIMEOUT_MS || 900000)
const loginTimeoutMs = Number(process.env.M2_LOGIN_TIMEOUT_MS || 600000)
const stageTimeoutMs = Number(process.env.M2_STAGE_TIMEOUT_MS || 960000)
const dreamWaitMs = Number(process.env.M2_DREAM_WAIT_MS || 150000)
const dreamCollision = process.env.M2_DREAM_COLLISION !== '0'

if (platform() !== 'win32' && process.env.M2_ALLOW_NON_WINDOWS !== '1') {
  throw new Error(PACKET + ' acceptance is Windows-first. Set M2_ALLOW_NON_WINDOWS=1 only for non-acceptance diagnostics.')
}

mkdirSync(workspace, { recursive: true })
mkdirSync(dirname(evidencePath), { recursive: true })
const meowHome = join(workspace, '.m2-home')
mkdirSync(meowHome, { recursive: true })
const originalHomeEnvironment = snapshotHomeEnvironment()

const legacyCompositeMetadataPresent = Object.keys(process.env)
  .filter((key) => key.startsWith('M2_LIVE_COMPOSITE_'))
  .sort()

const evidence = {
  packet: PACKET,
  sourceStartingHead: SOURCE_STARTING_HEAD,
  runId,
  platform: process.platform,
  node: process.version,
  workspace,
  profileDir,
  profileConvention: '~/.dsh-chatgpt-web-penrix/chrome-profile',
  model,
  executionContext: {
    integrationRef: process.env.M2_WIN_INTEGRATION_REF,
    integrationHead: process.env.M2_WIN_INTEGRATION_HEAD,
    m2SourceHead: process.env.M2_WIN_M2_SOURCE_HEAD,
    overlayPaths: process.env.M2_WIN_OVERLAY_PATHS?.split(',').filter(Boolean),
    changedPaths: process.env.M2_WIN_CHANGED_PATHS?.split(',').filter(Boolean),
    legacyCompositeMetadataPresent,
    legacyCompositeMetadataUsed: false,
  },
  continuityContract: {
    canonicalHistoryOwner: 'DSH Session',
    persistentChatGptConversationRequired: false,
    providerProfileReusedAcrossM1M2: true,
    providerPagePolicy: 'fresh Temporary Chat page per provider inference',
    webCodexRequired: false,
  },
  plugin: {
    upstreamSource: '0405e1a8e46c36a5945697f948d88998c8de99f9',
  },
  providerRequests: [],
  agentStatuses: [],
  agentErrors: [],
  stages: [],
  persistence: {},
  firstBlocker: null,
  finalStatus: 'running',
  startedAt: new Date().toISOString(),
}

let currentStage = 'bootstrap'
let ctx
let adapter
let mainAgent
let dreamCollisionQueued = false

function errorSummary(error) {
  return {
    name: error instanceof Error ? error.name : typeof error,
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  }
}

function writeEvidence() {
  evidence.updatedAt = new Date().toISOString()
  writeFileSync(evidencePath, JSON.stringify(evidence, null, 2) + '\n', 'utf8')
}

function textFromContent(content) {
  const out = []
  const visit = (value) => {
    if (!value || typeof value !== 'object') return
    if (value.type === 'text' && typeof value.text === 'string') out.push(value.text)
    if (Array.isArray(value.content)) for (const nested of value.content) visit(nested)
  }
  if (Array.isArray(content)) for (const block of content) visit(block)
  return out.join('\n')
}

function messageSummary(message) {
  if (!message) return null
  const source = message.source || {}
  return {
    role: message.role,
    source: {
      kind: source.kind,
      plugin: source.plugin,
      form: source.form,
      callId: source.callId,
    },
    text: textFromContent(message.content).slice(0, 12000),
  }
}

function memoryMeta(message) {
  const source = message?.source
  if (!source || source.kind !== 'plugin' || source.plugin !== 'meow-memory') return undefined
  const sections = Array.isArray(source.sections) ? source.sections : []
  const meta = sections.find((section) => section && section.name === '__meta__')
  if (!meta || typeof meta.text !== 'string') return undefined
  try {
    return JSON.parse(meta.text)
  } catch {
    return { parseError: true, raw: meta.text }
  }
}

function summarizeProviderRequest(options) {
  let compiled
  let compileError
  try {
    compiled = compilePrompt(options, composerMaxChars)
  } catch (error) {
    compileError = errorSummary(error)
  }
  const targetIndex = compiled?.targetMessageIndex
  const target = typeof targetIndex === 'number' ? options.messages[targetIndex] : undefined
  const memoryMessages = options.messages
    .filter((message) => message.source?.kind === 'plugin' && message.source?.plugin === 'meow-memory')
    .map((message) => ({
      ...messageSummary(message),
      meta: memoryMeta(message),
    }))
  const toolResultCallIds = options.messages
    .filter((message) => message.source?.kind === 'tool')
    .map((message) => String(message.source.callId || ''))
    .filter(Boolean)

  return {
    ordinal: evidence.providerRequests.length + 1,
    at: new Date().toISOString(),
    sessionId: options.sessionId === undefined ? undefined : String(options.sessionId),
    provider: options.provider,
    model: options.model,
    purpose: options.purpose,
    targetMessageIndex: targetIndex,
    target: messageSummary(target),
    memoryMessages,
    toolResultCallIds,
    compileError,
  }
}

function summarizeEvent(event) {
  const base = {
    seq: Number(event.seq),
    type: event.type,
  }
  const data = event.data || {}
  switch (event.type) {
    case 'tool/call':
      return {
        ...base,
        turn: data.turn,
        step: data.step,
        callId: String(data.callId),
        name: data.name,
        arguments: data.arguments,
      }
    case 'tool/result':
      return {
        ...base,
        turn: data.turn,
        step: data.step,
        callId: String(data.message?.source?.callId || ''),
        isError: Boolean(data.message?.content?.some?.((block) => block?.type === 'tool-result' && block.isError)),
        text: textFromContent(data.message?.content).slice(0, 20000),
        error: data.error,
      }
    case 'user/message':
      return {
        ...base,
        source: data.source,
        text: textFromContent(data.content).slice(0, 20000),
      }
    case 'assistant/message':
      return {
        ...base,
        turn: data.turn,
        step: data.step,
        message: messageSummary(data.message),
        interrupted: data.interrupted,
      }
    default:
      if (event.type.startsWith('compaction/')) {
        return { ...base, data }
      }
      if (event.type === 'turn/start' || event.type === 'turn/end'
        || event.type === 'step/start' || event.type === 'step/end'
        || event.type === 'request/header' || event.type === 'request/context') {
        return { ...base, data }
      }
      return base
  }
}

function relevantEvents(agent, from = 0) {
  return agent.session.snapshotEvents().slice(from).map(summarizeEvent)
}

function toolPairs(stage, name) {
  const calls = stage.events.filter((event) => event.type === 'tool/call' && event.name === name)
  return calls.map((call) => ({
    call,
    result: stage.events.find((event) => event.type === 'tool/result' && event.callId === call.callId),
    returnedToNextInference: stage.requests.some((request) => request.toolResultCallIds.includes(call.callId)),
  }))
}

function assertToolRoundTrip(stage, name) {
  const pairs = toolPairs(stage, name)
  assert.equal(pairs.length >= 1, true, 'expected ' + name + ' tool/call')
  const pair = pairs[0]
  assert.ok(pair.result, 'expected ' + name + ' tool/result')
  assert.equal(pair.result.isError, false, name + ' tool result is error')
  assert.equal(pair.returnedToNextInference, true, name + ' result did not reach the next provider inference')
  stage.toolProof = stage.toolProof || {}
  stage.toolProof[name] = pair
  return pair
}

function parseSearchId(stage, preferredToken) {
  const pair = assertToolRoundTrip(stage, 'memory_search')
  const lines = String(pair.result.text || '').split(/\r?\n/)
  const preferred = lines.find((line) => line.includes(preferredToken)) || lines.find((line) => /^\[[^\]]+\]\s+\[[^\]]+\]/.test(line))
  assert.ok(preferred, 'memory_search result did not expose a memory id')
  const match = preferred.match(/^\[[^\]]+\]\s+\[([^\]]+)\]/)
  assert.ok(match?.[1], 'memory_search result id could not be parsed')
  return match[1]
}

function beginStage(name) {
  currentStage = name
  const stage = {
    name,
    startedAt: new Date().toISOString(),
    status: 'running',
  }
  evidence.stages.push(stage)
  writeEvidence()
  return stage
}

function finishStage(stage, status, details = {}) {
  Object.assign(stage, details, {
    status,
    finishedAt: new Date().toISOString(),
  })
  writeEvidence()
}

function waitForIdle(agent, timeoutMs = stageTimeoutMs) {
  return new Promise((resolvePromise, rejectPromise) => {
    let dispose = () => {}
    const timer = setTimeout(() => {
      dispose()
      rejectPromise(new Error('Timed out waiting for agent idle: ' + String(agent.session.id)))
    }, timeoutMs)
    dispose = ctx.on('agent/status', ({ agent: subject, status }) => {
      if (subject !== agent || status !== 'idle') return
      clearTimeout(timer)
      dispose()
      resolvePromise()
    })
  })
}

async function runUserTurn(agent, name, text) {
  const stage = beginStage(name)
  const eventStart = agent.session.snapshotEvents().length
  const requestStart = evidence.providerRequests.length
  const errorStart = evidence.agentErrors.length
  const idle = waitForIdle(agent)
  agent.followup(createUserMessage({
    content: [{ type: 'text', text }],
    source: { kind: 'user' },
  }))
  await idle
  stage.events = relevantEvents(agent, eventStart)
  stage.requests = evidence.providerRequests.slice(requestStart)
  stage.agentErrors = evidence.agentErrors.slice(errorStart)
  if (stage.agentErrors.length > 0) {
    finishStage(stage, 'failed')
    throw new Error('Agent error during ' + name + ': ' + stage.agentErrors[0].error.message)
  }
  stage.observedAt = new Date().toISOString()
  writeEvidence()
  return stage
}

async function waitForCondition(label, predicate, timeoutMs, intervalMs = 250) {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const value = predicate()
    if (value) return value
    if (Date.now() >= deadline) throw new Error('Timed out waiting for ' + label)
    await new Promise((resolvePromise) => setTimeout(resolvePromise, intervalMs))
  }
}

function pluginTargetRequest(fromOrdinal, marker) {
  return evidence.providerRequests.find((request) =>
    request.ordinal > fromOrdinal
    && request.sessionId === String(mainAgent?.session.id)
    && request.target?.source?.kind === 'plugin'
    && request.target?.source?.plugin === 'meow-memory'
    && request.target?.text?.includes(marker))
}

function eventAfterSeq(agent, seq, type) {
  return agent.session.snapshotEvents()
    .map(summarizeEvent)
    .find((event) => event.seq > seq && event.type === type)
}

function dbEvidence() {
  const path = join(workspace, PROJECT_DIR, 'memory.db')
  return {
    path,
    exists: existsSync(path),
    bytes: existsSync(path) ? statSync(path).size : 0,
  }
}

async function main() {
  const require = createRequire(import.meta.url)
  const manifestPath = require.resolve('meow-memory/package.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  assert.equal(manifest.name, 'meow-memory')
  assert.equal(manifest.version, '0.27.0')
  assert.match(String(manifest.repository?.url || ''), /Phant0Meow\/dsh-meow-memory/)
  evidence.plugin = {
    ...evidence.plugin,
    name: manifest.name,
    version: manifest.version,
    repository: manifest.repository?.url,
    manifestPath,
  }

  // meow-memory 0.27.0 captures several homedir-owned diagnostic/prompt/window
  // paths at module import. Scope the fake home to that import only. The project
  // DB is independently isolated by workspace + PROJECT_DIR.
  let meowMemory
  try {
    meowMemory = await withTemporaryHome(meowHome, () => import('meow-memory'))
  } finally {
    // Defensive restoration even if the import/bootstrap helper itself changes.
    restoreHomeEnvironment(originalHomeEnvironment)
  }
  assert.equal(meowMemory.name, 'meow-memory')
  assert.deepEqual(meowMemory.inject, ['tools'])
  assert.deepEqual(
    snapshotHomeEnvironment(),
    originalHomeEnvironment,
    'HOME/USERPROFILE must be restored before ChatGPT adapter/browser startup',
  )
  evidence.environment = {
    meowImportHome: meowHome,
    restoredBeforeAdapter: true,
    originalHomeDefined: originalHomeEnvironment.HOME !== undefined,
    originalUserProfileDefined: originalHomeEnvironment.USERPROFILE !== undefined,
  }
  writeEvidence()

  try {
    ctx = new Context()
    await ctx.plugin(LlmRuntime)
    await ctx.plugin(SessionStore)
    await ctx.plugin(SessionProjectionRegistry)
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(AgentRegistry)
    await ctx.plugin(AgentLoop, { agents: [] })
    await ctx.plugin(TokenMeter)
    await ctx.plugin(BasicCompaction, { auto: false })

    const adapterOptions = {
      profileDir,
      ...(process.env.M2_CHATGPT_CHROME ? { chromeExecutablePath: resolve(process.env.M2_CHATGPT_CHROME) } : {}),
      headed: process.env.M2_CHATGPT_HEADLESS !== '1',
      loginTimeoutMs,
      turnTimeoutMs,
      composerMaxChars,
      contextWindow: 90000,
      maxTokens: 16384,
    }
    adapter = new ChatGptWebAdapter(adapterOptions)
    ctx.llm.registerAdapter(['chatgpt-web'], adapter)

    ctx.on('llm/stream', (options, next) => {
      const request = summarizeProviderRequest(options)
      evidence.providerRequests.push(request)
      writeEvidence()

      if (dreamCollision && mainAgent && !dreamCollisionQueued
        && request.sessionId === String(mainAgent.session.id)
        && request.target?.source?.kind === 'plugin'
        && request.target?.source?.plugin === 'meow-memory'
        && request.target?.text?.includes(DREAM_MARKER)) {
        dreamCollisionQueued = true
        queueMicrotask(() => {
          mainAgent.followup(createUserMessage({
            content: [{ type: 'text', text: 'M2 dream collision dogfood: preserve this genuine user prompt while automatic dream is active.' }],
            source: { kind: 'user' },
          }))
        })
      }
      return next()
    })

    ctx.on('agent/status', ({ agent, status }) => {
      evidence.agentStatuses.push({
        at: new Date().toISOString(),
        sessionId: String(agent.session.id),
        status,
      })
      writeEvidence()
    })

    ctx.on('agent/error', ({ agent, error }) => {
      evidence.agentErrors.push({
        at: new Date().toISOString(),
        sessionId: String(agent.session.id),
        error: errorSummary(error),
      })
      writeEvidence()
    })

    await ctx.plugin(meowMemory, {
      enabled: true,
      projectDir: PROJECT_DIR,
      hitTopK: 4,
      reflect: true,
      reflectTurns: 1,
      autoMigrate: false,
      promptLang: 'en',
      dream: {
        enabled: true,
        idleMinutes: 1,
        suppressWindows: [],
        suppressLeadMinutes: 0,
        checkMinutes: 1,
        timeZone: 'UTC',
        rulesReviewDays: 0,
      },
    })

    let visibleMemoryTools
    await ctx.plugin({
      name: 'm2-live-tools-probe',
      inject: ['tools'],
      apply(probeCtx) {
        visibleMemoryTools = probeCtx.tools.schemas()
          .map((tool) => tool.name)
          .filter((name) => name.startsWith('memory_'))
          .sort()
      },
    })
    assert.deepEqual(visibleMemoryTools, [
      'memory_dream',
      'memory_find_similar',
      'memory_project',
      'memory_read',
      'memory_remember',
      'memory_search',
      'memory_update',
    ])
    evidence.plugin.visibleMemoryTools = visibleMemoryTools
    writeEvidence()

    ctx.tools.register(defineContentToolFixture({
      name: 'm2_live_echo',
      description: 'M2 live acceptance tool. Return the supplied text exactly.',
      parameters: {
        text: { type: 'string', required: true },
      },
      async execute({ text }) {
        return [{ type: 'text', text: 'm2-live-echo:' + text }]
      },
    }))

    const project = 'm2-live-' + runId
    const seedToken = 'M2SEED_' + runId
    const durableToken = 'M2DURABLE_' + runId
    const updatedToken = durableToken + '_UPDATED'
    evidence.identifiers = { project, seedToken, durableToken, updatedToken }

    const seedAgent = await ctx.agentLoop.create(
      SessionId('m2-live-seed-' + runId),
      { provider: 'chatgpt-web', model },
      { cwd: workspace },
    )
    const seed = await runUserTurn(
      seedAgent,
      'seed-real-memory',
      'Use memory_remember exactly once before answering. Store this exact fact: "' + seedToken
        + ' is the seed fact for WEB-M2-WIN-LIVE-007." Use project "' + project
        + '", level "fact", importance 5, and keywords ["' + seedToken + '","m2-live-seed"].',
    )
    assertToolRoundTrip(seed, 'memory_remember')
    evidence.persistence.afterSeed = dbEvidence()
    assert.equal(evidence.persistence.afterSeed.exists, true, 'meow-memory SQLite database was not created')
    assert.equal(evidence.persistence.afterSeed.bytes > 0, true, 'meow-memory SQLite database is empty')
    finishStage(seed, 'passed')

    mainAgent = await ctx.agentLoop.create(
      SessionId('m2-live-main-' + runId),
      { provider: 'chatgpt-web', model },
      { cwd: workspace },
    )
    evidence.mainSessionId = String(mainAgent.session.id)
    evidence.seedSessionId = String(seedAgent.session.id)

    const first = await runUserTurn(
      mainAgent,
      'main-first-turn-snapshot-and-search',
      'This is the first real user turn of the main acceptance session. Use memory_search with query "'
        + seedToken + '" before answering, then report whether the seed fact exists.',
    )
    assertToolRoundTrip(first, 'memory_search')
    const firstRequest = first.requests.find((request) => request.purpose === undefined)
    assert.ok(firstRequest, 'main first turn produced no provider request')
    assert.equal(firstRequest.target?.source?.kind, 'user', 'first request target is not the genuine user message')
    assert.equal(firstRequest.memoryMessages.some((message) => message.source?.form === 'snapshot'), true,
      'first request contains no meow-memory snapshot')
    first.firstTurnProof = {
      targetMessageIndex: firstRequest.targetMessageIndex,
      target: firstRequest.target,
      snapshots: firstRequest.memoryMessages.filter((message) => message.source?.form === 'snapshot'),
    }
    finishStage(first, 'passed')

    const remember = await runUserTurn(
      mainAgent,
      'main-memory-remember',
      'Use memory_remember exactly once before answering. Store this exact durable fact: "'
        + durableToken + ' means the live memory round-trip is durable." Use project "' + project
        + '", level "fact", importance 7, and keywords ["' + durableToken + '","m2-live-durable"].',
    )
    assertToolRoundTrip(remember, 'memory_remember')
    finishStage(remember, 'passed')

    const search = await runUserTurn(
      mainAgent,
      'main-memory-search',
      'Use memory_search with query "' + durableToken + '" before answering. Do not invent an id; rely on the tool result.',
    )
    const durableId = parseSearchId(search, durableToken)
    evidence.identifiers.durableId = durableId
    finishStage(search, 'passed', { durableId })

    const projectStage = await runUserTurn(
      mainAgent,
      'main-memory-project',
      'Use memory_project exactly once with project "' + project + '" before answering. Summarize only what the tool returns.',
    )
    assertToolRoundTrip(projectStage, 'memory_project')
    finishStage(projectStage, 'passed')

    const read = await runUserTurn(
      mainAgent,
      'main-memory-read',
      'Use memory_read exactly once with id "' + durableId + '" before answering. Report the remembered content from the tool result.',
    )
    assertToolRoundTrip(read, 'memory_read')
    finishStage(read, 'passed')

    const update = await runUserTurn(
      mainAgent,
      'main-memory-update',
      'Use memory_update exactly once with id "' + durableId + '". Set content to "'
        + updatedToken + ' means the live memory round-trip survived update and later fresh-page recall.", '
        + 'importance to 8, and keywords ["' + updatedToken + '","m2-live-updated"]. Then answer briefly.',
    )
    assertToolRoundTrip(update, 'memory_update')
    evidence.persistence.afterUpdate = dbEvidence()
    finishStage(update, 'passed')

    const requestOrdinalBeforeFreshRecall = evidence.providerRequests.length
    const freshRecall = await runUserTurn(
      mainAgent,
      'fresh-temporary-page-continuity',
      'Without relying on ChatGPT conversation history, use memory_search with query "' + updatedToken
        + '". Then use memory_read on the matching id if needed and state the updated fact.',
    )
    assertToolRoundTrip(freshRecall, 'memory_search')
    const freshRequests = freshRecall.requests.filter((request) => request.purpose === undefined)
    assert.equal(freshRequests.length >= 2, true, 'fresh-page recall did not perform a tool-result continuation inference')
    assert.equal(freshRequests[0].ordinal > requestOrdinalBeforeFreshRecall, true, 'provider request ordinal did not advance')
    freshRecall.freshPageProof = {
      canonicalSessionId: String(mainAgent.session.id),
      providerInvariant: 'ChatGptWebAdapter opens ChatGptBrowser.newTurnPage() and closes it for every inference.',
      requestOrdinals: freshRequests.map((request) => request.ordinal),
      recalledUpdatedToken: freshRecall.events.some((event) =>
        event.type === 'tool/result' && String(event.text || '').includes(updatedToken)),
    }
    assert.equal(freshRecall.freshPageProof.recalledUpdatedToken, true, 'updated memory was not returned on later recall')
    finishStage(freshRecall, 'passed')

    const compactStage = beginStage('real-dsh-compaction-and-reinjection')
    const compactEventStart = mainAgent.session.snapshotEvents().length
    const compactRequestStart = evidence.providerRequests.length
    const compactResult = await ctx.compaction.compactNow(mainAgent, new AbortController().signal)
    assert.ok(compactResult, 'real DSH compactNow returned null; no compactable range was selected')
    compactStage.compactionResult = compactResult
    compactStage.events = relevantEvents(mainAgent, compactEventStart)
    compactStage.requests = evidence.providerRequests.slice(compactRequestStart)
    const end = compactStage.events.find((event) => event.type === 'compaction/end')
    assert.ok(end, 'no compaction/end event recorded')
    assert.equal(end.data?.error === undefined || end.data?.error === null || end.data?.error === '', true,
      'compaction/end recorded an error')
    finishStage(compactStage, 'compacted')

    const reinjection = await runUserTurn(
      mainAgent,
      'post-compaction-real-user-reinjection',
      'This is the first genuine user turn after real DSH compaction. State the project name you remember, without assuming ChatGPT page history.',
    )
    const reinjectionRequest = reinjection.requests.find((request) => request.purpose === undefined)
    assert.ok(reinjectionRequest, 'post-compaction turn produced no provider request')
    const reinjected = reinjectionRequest.memoryMessages.filter((message) =>
      message.source?.form === 'snapshot' && message.meta?.kind === 'reinjection')
    assert.equal(reinjected.length > 0, true, 'meow-memory reinjection snapshot was not visible after compaction')
    reinjection.reinjectionProof = reinjected
    finishStage(reinjection, 'passed')

    const reflectRequestStart = evidence.providerRequests.length
    const reflectEventStart = mainAgent.session.snapshotEvents().length
    const echo = await runUserTurn(
      mainAgent,
      'reflection-trigger-non-memory-tool',
      'Use m2_live_echo exactly once with text "reflection-trigger-' + runId
        + '" before answering. This non-memory tool call exists only to trigger meow-memory reflection.',
    )
    assertToolRoundTrip(echo, 'm2_live_echo')
    finishStage(echo, 'passed')

    const reflectionStage = beginStage('real-provider-reflection')
    const reflectRequest = await waitForCondition(
      'meow-memory reflection provider request',
      () => pluginTargetRequest(reflectRequestStart, REFLECT_MARKER),
      stageTimeoutMs,
    )
    const reflectUserEvent = await waitForCondition(
      'meow-memory reflection user/message',
      () => mainAgent.session.snapshotEvents().map(summarizeEvent).find((event) =>
        event.type === 'user/message'
        && event.seq >= (mainAgent.session.snapshotEvents()[reflectEventStart]?.seq ?? 0)
        && event.source?.kind === 'plugin'
        && event.source?.plugin === 'meow-memory'
        && String(event.text || '').includes(REFLECT_MARKER)),
      stageTimeoutMs,
    )
    await waitForCondition(
      'reflection turn/end',
      () => eventAfterSeq(mainAgent, reflectUserEvent.seq, 'turn/end'),
      stageTimeoutMs,
    )
    reflectionStage.request = reflectRequest
    reflectionStage.events = relevantEvents(mainAgent, reflectEventStart)
    reflectionStage.proof = {
      targetIsPlugin: reflectRequest.target?.source?.kind === 'plugin',
      plugin: reflectRequest.target?.source?.plugin,
      marker: REFLECT_MARKER,
    }
    assert.equal(reflectionStage.proof.targetIsPlugin, true)
    assert.equal(reflectionStage.proof.plugin, 'meow-memory')
    finishStage(reflectionStage, 'passed')

    const dreamStage = beginStage('automatic-dream-busy-turn-dogfood')
    const dreamRequestStart = evidence.providerRequests.length
    const dreamEventStart = mainAgent.session.snapshotEvents().length
    const dreamErrorStart = evidence.agentErrors.length
    const dreamRequest = await waitForCondition(
      'automatic meow-memory dream provider request',
      () => pluginTargetRequest(dreamRequestStart, DREAM_MARKER),
      dreamWaitMs,
      500,
    )
    dreamStage.request = dreamRequest
    dreamStage.collisionPromptQueued = dreamCollisionQueued
    await waitForCondition(
      'dream/collision settlement',
      () => {
        const errors = evidence.agentErrors.slice(dreamErrorStart)
        if (errors.length > 0) return { kind: 'error', errors }
        const events = relevantEvents(mainAgent, dreamEventStart)
        const dreamUser = events.find((event) => event.type === 'user/message'
          && event.source?.kind === 'plugin'
          && event.source?.plugin === 'meow-memory'
          && String(event.text || '').includes(DREAM_MARKER))
        if (!dreamUser) return undefined
        const laterEnd = events.find((event) => event.type === 'turn/end' && event.seq > dreamUser.seq)
        return laterEnd ? { kind: 'completed', laterEnd } : undefined
      },
      stageTimeoutMs,
      500,
    )
    dreamStage.events = relevantEvents(mainAgent, dreamEventStart)
    dreamStage.agentErrors = evidence.agentErrors.slice(dreamErrorStart)
    const dreamToolErrors = dreamStage.events.filter((event) => event.type === 'tool/result' && event.isError)
    if (dreamStage.agentErrors.length > 0 || dreamToolErrors.length > 0) {
      finishStage(dreamStage, 'blocked-known-edge')
      evidence.firstBlocker = {
        stage: dreamStage.name,
        reason: 'Automatic dream/busy-turn dogfood produced a real error.',
        errors: dreamStage.agentErrors,
        toolErrors: dreamToolErrors,
        eventOrder: dreamStage.events,
      }
      evidence.finalStatus = 'blocked-known-dream-edge'
      process.exitCode = 2
      return
    }
    finishStage(dreamStage, 'passed-no-collision-observed')

    evidence.persistence.final = dbEvidence()
    evidence.finalStatus = 'passed'
  } finally {
    if (ctx) await ctx.fiber.dispose().catch(() => {})
    if (adapter) await adapter.dispose().catch(() => {})
    restoreHomeEnvironment(originalHomeEnvironment)
  }
}

try {
  await main()
} catch (error) {
  const summary = errorSummary(error)
  const runningStage = [...evidence.stages].reverse().find((stage) => stage.status === 'running')
  if (runningStage) finishStage(runningStage, 'failed', { error: summary })
  evidence.firstBlocker = evidence.firstBlocker || {
    stage: currentStage,
    error: summary,
  }
  evidence.finalStatus = 'blocked'
  process.exitCode = 1
} finally {
  evidence.finishedAt = new Date().toISOString()
  writeEvidence()
  process.stdout.write(JSON.stringify({
    packet: evidence.packet,
    status: evidence.finalStatus,
    evidencePath,
    firstBlocker: evidence.firstBlocker,
  }, null, 2) + '\n')
}
