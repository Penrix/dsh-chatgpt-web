import { homedir } from 'node:os'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { ChatGptWebAdapter } from './adapter.ts'
import { registerWebCodexReadFilesTool } from './webcodex/read-files.ts'

export const name = 'penrix-llm-chatgpt-web'
export const inject = ['llm']
export const PROVIDER = 'chatgpt-web'

export interface WebCodexReadConfig {
  baseUrl: string
  bearerToken: string
  project: string
}

export interface Config {
  profileDir?: string
  chromeExecutablePath?: string
  headed?: boolean
  loginTimeoutMs?: number
  turnTimeoutMs?: number
  composerMaxChars?: number
  contextWindow?: number
  maxTokens?: number
  webcodexRead?: WebCodexReadConfig
}

export const Config: z<Config> = z.object({
  profileDir: z.string().default(join(homedir(), '.dsh-chatgpt-web-penrix', 'chrome-profile')),
  chromeExecutablePath: z.string(),
  headed: z.boolean().default(true),
  loginTimeoutMs: z.number().min(1).default(600_000),
  turnTimeoutMs: z.number().min(1).default(900_000),
  composerMaxChars: z.number().step(1).min(1).default(180_000),
  contextWindow: z.number().step(1).min(1).default(90_000),
  maxTokens: z.number().step(1).min(1).default(16_384),
  webcodexRead: z.union([z.object({
    baseUrl: z.string().required(),
    bearerToken: z.string().required(),
    project: z.string().required(),
  })]),
})

export function apply(ctx: Context, config: Config): void {
  const adapter = new ChatGptWebAdapter({
    profileDir: config.profileDir ?? join(homedir(), '.dsh-chatgpt-web-penrix', 'chrome-profile'),
    ...(config.chromeExecutablePath ? { chromeExecutablePath: config.chromeExecutablePath } : {}),
    headed: config.headed ?? true,
    loginTimeoutMs: config.loginTimeoutMs ?? 600_000,
    turnTimeoutMs: config.turnTimeoutMs ?? 900_000,
    composerMaxChars: config.composerMaxChars ?? 180_000,
    contextWindow: config.contextWindow ?? 90_000,
    maxTokens: config.maxTokens ?? 16_384,
  })

  ctx.llm.registerAdapter([PROVIDER], adapter)

  if (config.webcodexRead !== undefined) {
    const webcodexRead = config.webcodexRead
    ctx.inject(['tools'], toolCtx => {
      registerWebCodexReadFilesTool(toolCtx, webcodexRead)
    })
  }

  ctx.effect(() => async () => {
    await adapter.dispose().catch(() => {})
  })
}

export { ChatGptWebAdapter } from './adapter.ts'
export { compilePrompt } from './chatgpt/prompt.ts'

export {
  WEBCODEX_READ_FILES_ACTION_PATH,
  WEBCODEX_READ_FILES_TOOL,
  WebCodexHttpError,
  invokeWebCodexReadFiles,
  registerWebCodexReadFilesTool,
} from './webcodex/index.ts'
export type {
  WebCodexJsonValue,
  WebCodexReadFilesArguments,
  WebCodexReadFilesItem,
  WebCodexReadFilesSeamOptions,
  WebCodexToolResult,
} from './webcodex/index.ts'
