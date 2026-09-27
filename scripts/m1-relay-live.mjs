import { ChatGptWebAdapter } from '../lib/index.js'

const relayBaseUrl = process.env.CODEX_CHATGPT_WEB_BASE_URL?.trim() || 'http://127.0.0.1:17841/v1'
const model = process.env.DSH_CHATGPT_WEB_MODEL?.trim() || 'chatgpt-web/high'

if (!['chatgpt-web/high', 'chatgpt-web/extra-high', 'chatgpt-web/pro'].includes(model)) {
  throw new Error('M1A relay live acceptance requires chatgpt-web/high or stronger.')
}

const endpoint = new URL('/v1/responses', relayBaseUrl)
const preflight = await fetch(endpoint, { method: 'GET' })
if (preflight.status !== 426) {
  throw new Error('M1A relay preflight expected HTTP 426, got ' + preflight.status)
}
await preflight.body?.cancel().catch(() => {})

const adapter = new ChatGptWebAdapter({
  profileDir: 'relay-unused',
  headed: false,
  loginTimeoutMs: 1,
  turnTimeoutMs: 1,
  composerMaxChars: 180_000,
  contextWindow: 90_000,
  maxTokens: 16_384,
  relayBaseUrl,
})

let text = ''
let finishKind
try {
  for await (const chunk of adapter.stream({
    provider: 'chatgpt-web',
    model,
    messages: [{
      role: 'user',
      content: [{ type: 'text', text: 'Reply with exactly OK.' }],
      source: { kind: 'user' },
    }],
  })) {
    if (chunk.type === 'text-delta') text += chunk.text
    if (chunk.type === 'finish') finishKind = chunk.reason.kind
  }
} finally {
  await adapter.dispose()
}

if (text !== 'OK') {
  throw new Error('M1A relay live acceptance expected exact OK, got ' + JSON.stringify(text))
}
if (finishKind !== 'stop') {
  throw new Error('M1A relay live acceptance expected stop finish, got ' + String(finishKind))
}

process.stdout.write(JSON.stringify({
  status: 'PASS',
  evidence: 'DSH adapter -> codex-chatgpt-web Responses relay -> ChatGPT Web -> DSH adapter',
  relayBaseUrl,
  model,
  answer: text,
}, null, 2) + '\n')
