import { join } from 'node:path'
import {
  CHATGPT_WEB_BACKEND_MODEL,
  CHATGPT_WEB_LUNA_BACKEND_MODEL,
  ManagedChatGptWebTransport,
  type ManagedChatGptWebEffort,
  type ManagedChatGptWebModel,
} from 'codex-chatgpt-web/transport'
import { LlmAdapter, LlmError, resolveRetryPolicy } from '@deepseek-ai/dsh-llm'
import type {
  GenerateOptions,
  LlmModelInfo,
  LlmProviderInfo,
  LlmResolvedModelInfo,
  StreamChunk,
} from '@deepseek-ai/dsh-llm'
import { compilePrompt } from './chatgpt/prompt.ts'
import { parseReasoningResult, reasoningResultChunks } from './reasoning-result.ts'

export interface AdapterOptions {
  profileDir: string
  chromeExecutablePath?: string
  headed: boolean
  loginTimeoutMs: number
  composerMaxChars: number
  contextWindow: number
  maxTokens: number
  turnTimeoutMs?: number
  onReasoningEnvelopeError?: (diagnostic: { rawText: string; error: unknown }) => void
  allowInteractiveLogin?: boolean
}

const MODELS = [
  { id: 'chatgpt-web/luna', name: 'ChatGPT Web Luna', contextWindow: 1_050_000 },
  { id: 'chatgpt-web/think', name: 'ChatGPT Web Think', contextWindow: 1_050_000 },
  { id: 'chatgpt-web/light', name: 'ChatGPT Web Instant', contextWindow: 41_000 },
  { id: 'chatgpt-web/medium', name: 'ChatGPT Web Medium', contextWindow: 90_000 },
  { id: 'chatgpt-web/high', name: 'ChatGPT Web High', contextWindow: 90_000 },
  { id: 'chatgpt-web/extra-high', name: 'ChatGPT Web Extra High', contextWindow: 112_001 },
  { id: 'chatgpt-web/pro', name: 'ChatGPT Web Pro', contextWindow: 112_001 },
] as const

export interface EmbeddedChatGptRoute {
  model: ManagedChatGptWebModel
  effort: ManagedChatGptWebEffort
}

export function resolveEmbeddedChatGptRoute(model: string): EmbeddedChatGptRoute {
  switch (model) {
    case 'chatgpt-web/luna':
      return { model: CHATGPT_WEB_LUNA_BACKEND_MODEL, effort: 'low' }
    case 'chatgpt-web/think':
      return { model: CHATGPT_WEB_LUNA_BACKEND_MODEL, effort: 'medium' }
    case 'chatgpt-web/light':
      return { model: CHATGPT_WEB_BACKEND_MODEL, effort: 'low' }
    case 'chatgpt-web/medium':
      return { model: CHATGPT_WEB_BACKEND_MODEL, effort: 'medium' }
    case 'chatgpt-web/high':
      return { model: CHATGPT_WEB_BACKEND_MODEL, effort: 'high' }
    case 'chatgpt-web/extra-high':
      return { model: CHATGPT_WEB_BACKEND_MODEL, effort: 'xhigh' }
    case 'chatgpt-web/pro':
      return { model: CHATGPT_WEB_BACKEND_MODEL, effort: 'max' }
    default:
      throw new LlmError(`Unsupported ChatGPT Web route ${model}.`, 'INVALID_REQUEST')
  }
}

export class ChatGptWebAdapter extends LlmAdapter {
  private transport?: ManagedChatGptWebTransport
  private queue: Promise<void> = Promise.resolve()

  constructor(private readonly options: AdapterOptions) {
    super()
  }

  override providerInfo(provider: string): LlmProviderInfo {
    return { id: provider, name: 'Penrix ChatGPT Web' }
  }

  override providerRetryPolicy() {
    return resolveRetryPolicy({ mode: 'normal', maxRetries: 0 }, 'chatgpt-web.retryPolicy')
  }

  override listModels(provider: string): Promise<readonly LlmModelInfo[]> {
    return Promise.resolve(MODELS.map(model => ({
      provider,
      id: model.id,
      name: model.name,
      description: 'DSH-owned inference through ChatGPT Web.',
      inputModalities: ['text' as const],
    })))
  }

  override resolveModel(provider: string, model: string): Promise<LlmResolvedModelInfo> {
    const entry = MODELS.find(candidate => candidate.id === model)
    if (!entry) {
      return Promise.reject(new LlmError(
        `Unsupported ChatGPT Web route ${model}.`,
        'INVALID_REQUEST',
      ))
    }
    return Promise.resolve({
      provider,
      id: model,
      name: entry.name,
      inputModalities: ['text'],
      context: { contextWindow: Math.min(this.options.contextWindow, entry.contextWindow) },
      defaultMaxTokens: this.options.maxTokens,
    })
  }

  override stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    return this.serializedTurn(options)
  }

  async dispose(): Promise<void> {
    await this.transport?.close()
  }

  private embeddedTransport(): ManagedChatGptWebTransport {
    if (this.transport) return this.transport
    this.transport = new ManagedChatGptWebTransport({
      storageStatePath: join(this.options.profileDir, 'storage-state.json'),
      ...(this.options.chromeExecutablePath
        ? { chromeExecutablePath: this.options.chromeExecutablePath }
        : {}),
      headed: this.options.headed,
      ...(this.options.turnTimeoutMs === undefined ? {} : { turnTimeoutMs: this.options.turnTimeoutMs }),
      browserDiagnosticsPath: join(this.options.profileDir, 'diagnostics', 'browser-turns'),
      loginProfileDir: this.options.profileDir,
      reusableLoginProfileDirs: [
        this.options.profileDir,
        join(this.options.profileDir, 'login-profile'),
      ],
      ...(this.options.allowInteractiveLogin === undefined
        ? {}
        : { allowInteractiveLogin: this.options.allowInteractiveLogin }),
    })
    return this.transport
  }

  private async runEmbedded(
    options: GenerateOptions,
    prompt: string,
  ): Promise<string> {
    const transport = this.embeddedTransport()
    await transport.ensureLogin(this.options.loginTimeoutMs)
    const route = resolveEmbeddedChatGptRoute(options.model)
    return await transport.run({
      model: route.model,
      effort: route.effort,
      prompt,
      ...(options.signal ? { signal: options.signal } : {}),
    })
  }

  private async *serializedTurn(options: GenerateOptions): AsyncGenerator<StreamChunk> {
    let release!: () => void
    const mine = new Promise<void>(resolve => { release = resolve })
    const previous = this.queue
    this.queue = previous.then(() => mine, () => mine)
    await previous

    try {
      const compiled = compilePrompt(options, this.options.composerMaxChars)
      const resultText = await this.runEmbedded(options, compiled.text)

      let reasoning: ReturnType<typeof parseReasoningResult>
      try {
        reasoning = parseReasoningResult(resultText)
      } catch (error) {
        try {
          this.options.onReasoningEnvelopeError?.({ rawText: resultText, error })
        } catch {
          // Diagnostics must never replace the parser failure.
        }
        throw error
      }
      const callableTools = options.purpose === undefined ? options.tools : undefined
      const chunks = reasoningResultChunks(reasoning, callableTools)
      // Estimates, not provider-reported token counts. The independent
      // composer character limit remains enforced by compilePrompt.
      const usage = {
        inputTokens: Math.max(1, Math.ceil(compiled.text.length / 4)),
        outputTokens: Math.max(1, Math.ceil(resultText.length / 4)),
      }
      for (const chunk of chunks) {
        if (chunk.type === 'finish') {
          yield { type: 'usage', usage }
        }
        yield chunk
      }
    } finally {
      release()
    }
  }
}
