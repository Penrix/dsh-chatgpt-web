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

export interface AdapterOptions extends BrowserOptions {
  composerMaxChars: number
  contextWindow: number
  maxTokens: number
  turnTimeoutMs: number
}

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
    return Promise.resolve([{
      provider,
      id: 'chatgpt-web/current',
      name: 'ChatGPT Web — current account default',
      description: 'Phase 1: fresh Temporary Chat on every DSH inference.',
      inputModalities: ['text'],
    }])
  }

  override resolveModel(provider: string, model: string): Promise<LlmResolvedModelInfo> {
    if (model !== 'chatgpt-web/current') {
      return Promise.reject(new LlmError(
        `Phase 1 exposes only chatgpt-web/current; got ${model}.`,
        'INVALID_REQUEST',
      ))
    }
    return Promise.resolve({
      provider,
      id: model,
      name: 'ChatGPT Web — current account default',
      inputModalities: ['text'],
      context: { contextWindow: this.options.contextWindow },
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
          timeoutMs: this.options.turnTimeoutMs,
          ...(options.signal ? { signal: options.signal } : {}),
        })
        yield { type: 'block-start', index: 0, blockType: 'text' }
        yield { type: 'text-delta', index: 0, text: result.text }
        yield { type: 'block-end', index: 0, block: { type: 'text', text: result.text } }
        yield {
          type: 'usage',
          usage: {
            inputTokens: Math.max(1, Math.ceil(compiled.text.length / 4)),
            outputTokens: Math.max(1, Math.ceil(result.text.length / 4)),
          },
        }
        yield { type: 'finish', reason: { kind: 'stop' } }
      } finally {
        await page.close().catch(() => {})
      }
    } finally {
      release()
    }
  }
}
