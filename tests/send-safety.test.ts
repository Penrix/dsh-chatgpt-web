import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import { MIN_SEND_INTERVAL_MS, SendSafetyLease } from '../src/chatgpt/send-safety.ts'

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})

async function harness() {
  const root = await mkdtemp(join(tmpdir(), 'dsh-send-safety-test-'))
  roots.push(root)
  let now = 100_000
  const options = {
    root, now: () => now,
    sleep: async (ms: number, signal?: AbortSignal) => {
      if (signal?.aborted) throw new Error('aborted')
      now += ms
    },
  }
  return { root, options, time: () => now, advance: (ms: number) => { now += ms } }
}

describe('persisted send safety (no browser or real waits)', () => {
  it('blocks a separate process while a turn owns the shared lock', async () => {
    const h = await harness()
    const lease = await SendSafetyLease.acquire(h.options)
    const source = `import { SendSafetyLease } from ${JSON.stringify(pathToFileURL(resolve('src/chatgpt/send-safety.ts')).href)};
      try { const lease = await SendSafetyLease.acquire({root:${JSON.stringify(h.root)}}); await lease.release(); process.exitCode=1 }
      catch(e) { if(e.code !== 'PROVIDER_ERROR') throw e; console.log('blocked') }`
    const child = spawnSync(process.execPath, ['--experimental-transform-types', '--input-type=module', '--eval', source], { encoding: 'utf8' })
    expect(child.status, child.stderr).toBe(0)
    expect(child.stdout.trim()).toBe('blocked')
    await lease.release()
  })
  it('waits 30s for unknown history and preserves spacing across instances', async () => {
    const h = await harness()
    const sends: number[] = []
    const first = await SendSafetyLease.acquire(h.options)
    await first.dispatch(async () => { sends.push(h.time()) })
    expect(sends).toEqual([130_000])
    await first.complete()
    await first.release()
    const second = await SendSafetyLease.acquire(h.options)
    await second.dispatch(async () => { sends.push(h.time()) })
    expect(sends[1]! - sends[0]!).toBe(MIN_SEND_INTERVAL_MS)
    await second.complete()
    await second.release()
  })

  it('counts a delayed click from settlement, not reservation time', async () => {
    const h = await harness()
    const first = await SendSafetyLease.acquire(h.options)
    await first.dispatch(async () => { h.advance(25_000) })
    const settled = h.time()
    await first.complete()
    await first.release()
    const second = await SendSafetyLease.acquire(h.options)
    await second.dispatch(async () => { expect(h.time() - settled).toBeGreaterThanOrEqual(30_000) })
    await second.complete()
    await second.release()
  })

  it('holds the exclusive lock for the entire response, not just the click', async () => {
    const h = await harness()
    const first = await SendSafetyLease.acquire(h.options)
    await first.dispatch(async () => {})
    await expect(SendSafetyLease.acquire(h.options)).rejects.toMatchObject({ code: 'PROVIDER_ERROR' })
    await first.complete()
    await first.release()
  })

  it('refuses replay after a failed click even after recreation', async () => {
    const h = await harness()
    const first = await SendSafetyLease.acquire(h.options)
    await expect(first.dispatch(async () => { throw new Error('unknown dispatch') })).rejects.toThrow('unknown dispatch')
    await first.release()
    h.advance(600_000)
    await expect(SendSafetyLease.acquire(h.options)).rejects.toMatchObject({ code: 'PROVIDER_ERROR' })
  })

  it('persists a limiter stop even without a Send', async () => {
    const h = await harness()
    const first = await SendSafetyLease.acquire(h.options)
    await first.block()
    await first.release()
    h.advance(600_000)
    await expect(SendSafetyLease.acquire(h.options)).rejects.toMatchObject({ code: 'PROVIDER_ERROR' })
  })

  it('retains a longer persisted wait', async () => {
    const h = await harness()
    await writeFile(join(h.root, 'state.json'), JSON.stringify({ notBefore: 580_000, pending: false, blocked: null }))
    const lease = await SendSafetyLease.acquire(h.options)
    await lease.dispatch(async () => { expect(h.time()).toBe(580_000) })
    await lease.complete()
    await lease.release()
  })

  it('does not send when aborted during the wait', async () => {
    const h = await harness()
    const controller = new AbortController()
    const lease = await SendSafetyLease.acquire({ ...h.options, sleep: async () => { controller.abort() } })
    let clicks = 0
    await expect(lease.dispatch(async () => { clicks++ }, controller.signal)).rejects.toMatchObject({ code: 'ABORTED' })
    expect(clicks).toBe(0)
    await lease.release()
  })

  it('fails closed for corrupted state without silently resetting it', async () => {
    const h = await harness()
    await writeFile(join(h.root, 'state.json'), 'partial')
    await expect(SendSafetyLease.acquire(h.options)).rejects.toMatchObject({ code: 'PROVIDER_ERROR' })
    expect(await readFile(join(h.root, 'state.json'), 'utf8')).toBe('partial')
  })
})
