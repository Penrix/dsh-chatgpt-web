import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

const helperUrl = pathToFileURL(resolve('scripts/m2-dream-gate.mjs')).href

function run(source: string) {
  const prefix = `import { createDreamGate } from ${JSON.stringify(helperUrl)}\n`
  return spawnSync(process.execPath, ['--input-type=module', '--eval', prefix + source], { encoding: 'utf8' })
}

describe('M2 automatic dream arming gate', () => {
  it('rejects an early dream request even after an ordinary stage exceeds the one-minute threshold', () => {
    const result = run(`
const gate = createDreamGate()
const simulatedOrdinaryElapsedMs = 120000
let code = ''
try {
  gate.assertNoEarlyDream({ isDream: simulatedOrdinaryElapsedMs > 60000, sessionId: 'seed-session' })
} catch (error) {
  code = error.code
}
process.stdout.write(JSON.stringify({ code, gate: gate.snapshot() }))
`)

    expect(result.status).toBe(0)
    const parsed = JSON.parse(result.stdout) as { code: string; gate: { armed: boolean } }
    expect(parsed.code).toBe('M2_EARLY_DREAM')
    expect(parsed.gate.armed).toBe(false)
  })

  it('allows the armed final dream agent and queues collision only once for that agent', () => {
    const result = run(`
const gate = createDreamGate()
gate.arm('dream-agent')
gate.assertNoEarlyDream({ isDream: true, sessionId: 'dream-agent' })
const first = gate.shouldQueueCollision({ isDream: true, sessionId: 'dream-agent' })
const duplicate = gate.shouldQueueCollision({ isDream: true, sessionId: 'dream-agent' })
const wrongAgent = gate.shouldQueueCollision({ isDream: true, sessionId: 'main-agent' })
const nonDream = gate.shouldQueueCollision({ isDream: false, sessionId: 'dream-agent' })
process.stdout.write(JSON.stringify({ first, duplicate, wrongAgent, nonDream, gate: gate.snapshot() }))
`)

    expect(result.status).toBe(0)
    const parsed = JSON.parse(result.stdout) as {
      first: boolean
      duplicate: boolean
      wrongAgent: boolean
      nonDream: boolean
      gate: { armed: boolean; targetSessionId: string; collisionQueued: boolean }
    }
    expect(parsed.first).toBe(true)
    expect(parsed.duplicate).toBe(false)
    expect(parsed.wrongAgent).toBe(false)
    expect(parsed.nonDream).toBe(false)
    expect(parsed.gate).toEqual({ armed: true, targetSessionId: 'dream-agent', collisionQueued: true })
  })

  it('fails closed if an armed dream request targets a different session', () => {
    const result = run(`
const gate = createDreamGate()
gate.arm('dream-agent')
let code = ''
try {
  gate.assertNoEarlyDream({ isDream: true, sessionId: 'seed-session' })
} catch (error) {
  code = error.code
}
process.stdout.write(code)
`)

    expect(result.status).toBe(0)
    expect(result.stdout).toBe('M2_WRONG_DREAM_AGENT')
  })
})
