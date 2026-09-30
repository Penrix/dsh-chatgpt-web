import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  CHATGPT_WEB_BACKEND_MODEL,
  CHATGPT_WEB_LUNA_BACKEND_MODEL,
  ManagedChatGptWebTransport,
} from 'codex-chatgpt-web/transport'
import { ChatGptWebAdapter, resolveEmbeddedChatGptRoute } from '../src/adapter.ts'

describe('embedded mature ChatGPT Web transport', () => {
  it('maps DSH model routes to the upstream browser transport model and effort', () => {
    expect(resolveEmbeddedChatGptRoute('chatgpt-web/luna'))
      .toEqual({ model: CHATGPT_WEB_LUNA_BACKEND_MODEL, effort: 'low' })
    expect(resolveEmbeddedChatGptRoute('chatgpt-web/think'))
      .toEqual({ model: CHATGPT_WEB_LUNA_BACKEND_MODEL, effort: 'medium' })
    expect(resolveEmbeddedChatGptRoute('chatgpt-web/light'))
      .toEqual({ model: CHATGPT_WEB_BACKEND_MODEL, effort: 'low' })
    expect(resolveEmbeddedChatGptRoute('chatgpt-web/medium'))
      .toEqual({ model: CHATGPT_WEB_BACKEND_MODEL, effort: 'medium' })
    expect(resolveEmbeddedChatGptRoute('chatgpt-web/high'))
      .toEqual({ model: CHATGPT_WEB_BACKEND_MODEL, effort: 'high' })
    expect(resolveEmbeddedChatGptRoute('chatgpt-web/extra-high'))
      .toEqual({ model: CHATGPT_WEB_BACKEND_MODEL, effort: 'xhigh' })
    expect(resolveEmbeddedChatGptRoute('chatgpt-web/pro'))
      .toEqual({ model: CHATGPT_WEB_BACKEND_MODEL, effort: 'max' })
  })

  it('constructs the upstream managed transport without Launcher, relay, or browser startup', async () => {
    const transport = new ManagedChatGptWebTransport({
      storageStatePath: '/path/that/does/not/exist/storage-state.json',
      chromeExecutablePath: process.execPath,
      headed: true,
    })
    try {
      expect(transport.hasLogin()).toBe(false)
    } finally {
      await transport.close()
    }
  })

  it('runtime transport can refuse interactive login before any browser launch', async () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-chatgpt-web-no-login-'))
    const transport = new ManagedChatGptWebTransport({
      storageStatePath: join(root, 'storage-state.json'),
      chromeExecutablePath: process.execPath,
      loginProfileDir: root,
      reusableLoginProfileDirs: [],
      allowInteractiveLogin: false,
    })
    try {
      await expect(transport.ensureLogin(1)).rejects.toThrow(/interactive login is disabled/)
    } finally {
      await transport.close()
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('does not require Chrome or a login merely to construct and inspect provider metadata', async () => {
    const adapter = new ChatGptWebAdapter({
      profileDir: '/path/that/does/not/exist',
      chromeExecutablePath: '/browser/that/does/not/exist',
      headed: true,
      loginTimeoutMs: 1,
      turnTimeoutMs: 1,
      composerMaxChars: 180_000,
      contextWindow: 90_000,
      maxTokens: 16_384,
    })
    expect((await adapter.resolveModel('chatgpt-web', 'chatgpt-web/high')).id).toBe('chatgpt-web/high')
    await adapter.dispose()
  })

  it('fails closed for an unknown DSH Web route', () => {
    expect(() => resolveEmbeddedChatGptRoute('chatgpt-web/unknown')).toThrow(/Unsupported ChatGPT Web route/)
  })
})
