import { LlmAdapter, LlmError } from '@deepseek-ai/dsh-llm'
import type {
  GenerateOptions,
  LlmModelInfo,
  LlmProviderInfo,
  LlmResolvedModelInfo,
  StreamChunk,
} from '@deepseek-ai/dsh-llm'
import { ChatGptBrowser } from './chatgpt/browser.ts'
import type { BrowserOptions } from './chatgpt/browser.ts'
import { compilePrompt } from './chatgpt/prompt.ts'
import { runFreshTurn } from './chatgpt/turn.ts'
import { parseReasoningResult, reasoningResultChunks } from './reasoning-result.ts'

export interface AdapterOptions extends BrowserOptions {
  composerMaxChars: number
  contextWindow: number
  maxTokens: number
  turnTimeoutMs: number
  onReasoningEnvelopeError?: (diagnostic: { rawText: string; error: unknown }) => void
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

export class ChatGptWebAdapter extends LlmAdapter {
  private readonly browser: ChatGptBrowser
  private queue: Promise<void> = Promise.resolve()

  constructor(private readonly options: AdapterOptions) {
    super()
    this.browser = new ChatGptBrowser(options)
  }

  override providerInfo(provider: string): LlmProviderInfo {
    return { id: provider, name: 'Penrix ChatGPT Web' }
  }

  override listModels(provider: string): Promise<readonly LlmModelInfo[]> {
    return Promise.resolve(MODELS.map(model => ({
      provider,
      id: model.id,
      name: model.name,
      description: 'Phase 1: fresh Temporary Chat on every DSH inference.',
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
      context: { contextWindow: entry.contextWindow || this.options.contextWindow },
      defaultMaxTokens: this.options.maxTokens,
    })
  }

  override stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    return this.serializedTurn(options)
  }

  async dispose(): Promise<void> {
    await this.browser.close()
  }

  private async *serializedTurn(options: GenerateOptions): AsyncGenerator<StreamChunk> {
    let release!: () => void
    const mine = new Promise<void>(resolve => { release = resolve })
    const previous = this.queue
    this.queue = previous.then(() => mine, () => mine)
    await previous

    try {
      const compiled = compilePrompt(options, this.options.composerMaxChars)
      const page = await this.browser.newTurnPage(options.signal)
      try {
        const result = await runFreshTurn(page, compiled.text, {
          model: options.model,
          timeoutMs: this.options.turnTimeoutMs,
          ...(options.signal ? { signal: options.signal } : {}),
        })
        let reasoning
        try {
          reasoning = parseReasoningResult(result.text)
        } catch (error) {
          this.options.onReasoningEnvelopeError?.({ rawText: result.text, error })
          throw error
        }
        const callableTools = options.purpose === undefined ? options.tools : undefined
        const chunks = reasoningResultChunks(reasoning, callableTools)
        const usage = {
          inputTokens: Math.max(1, Math.ceil(compiled.text.length / 4)),
          outputTokens: Math.max(1, Math.ceil(result.text.length / 4)),
        }
        for (const chunk of chunks) {
          if (chunk.type === 'finish') {
            yield { type: 'usage', usage }
          }
          yield chunk
        }
      } finally {
        await page.close().catch(() => {})
      }
    } finally {
      release()
    }
  }
}
