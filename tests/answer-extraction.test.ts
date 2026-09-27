import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { chromium, type Browser, type Page } from 'playwright-core'
import { resolveChromeExecutable } from '../src/chatgpt/browser.ts'
import { extractReasoningText } from '../src/chatgpt/turn.ts'
import { parseReasoningResult, reasoningResultChunks } from '../src/reasoning-result.ts'

// Opt-in offline DOM check: empty, nonpersistent browser; all requests blocked.
describe.skipIf(process.env.RUN_OFFLINE_DOM_TESTS !== '1')('rendered answer -> parser', () => {
  let browser: Browser
  let page: Page
  beforeAll(async () => {
    browser = await chromium.launch({ executablePath: resolveChromeExecutable(), headless: true })
    const context = await browser.newContext({ serviceWorkers: 'block' })
    await context.route('**/*', route => route.abort())
    page = await context.newPage()
  })
  afterAll(async () => { await browser?.close() }, 30_000)

  const escape = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  async function render(body: string) {
    await page.setContent(`<div data-testid="conversation-turn-1" data-message-author-role="assistant"><div class="markdown">${body}</div></div>`)
  }

  it.each(['a*b', 'a [b]', String.raw`C:\Users\123`, String.raw`literal \n and \_`, '中文 "引号"\n第二行', '**bold** _emphasis_ <tag> &', 'literal ```json fence'])('preserves content %j', async content => {
    const raw = JSON.stringify({ type: 'final', content })
    await render(`<pre><div>json<button>复制代码</button></div><code>${escape(raw)}</code></pre>`)
    expect(parseReasoningResult(await extractReasoningText(page))).toEqual({ type: 'final', content })
    await render(`<p>${escape(raw)}</p>`)
    expect(parseReasoningResult(await extractReasoningText(page))).toEqual({ type: 'final', content })
  }, 30_000)

  it('preserves tool arguments all the way into native tool-call chunks', async () => {
    const args = { path: String.raw`C:\Users\123\a[b]*.md` }
    await render(`<pre><code>${escape(JSON.stringify({ type: 'action_proposal', action: 'read_file', arguments: args }))}</code></pre>`)
    const result = parseReasoningResult(await extractReasoningText(page))
    const chunks = reasoningResultChunks(result, [{ name: 'read_file', description: 'Read', parameters: {
      type: 'object', properties: { path: { type: 'string' } }, required: ['path'], additionalProperties: false,
    } }])
    const call = chunks.find(chunk => chunk.type === 'tool-call-delta')
    expect(call?.type === 'tool-call-delta' && JSON.parse(call.argumentsDelta!)).toEqual(args)
  })

  it('does not discard ambiguous content outside a code block or in another answer block', async () => {
    const raw = '{"type":"final","content":"ok"}'
    await render(`<p>${raw}</p><pre><code>${raw}</code></pre>`)
    await expect(extractReasoningText(page)).rejects.toThrow(/outside/)
    await page.setContent(`<div data-testid="conversation-turn-1" data-message-author-role="assistant"><div class="markdown">${raw}</div><div class="markdown">${raw}</div></div>`)
    const multiple = await extractReasoningText(page)
    expect(() => parseReasoningResult(multiple)).toThrow()
  })
})
