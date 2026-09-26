const HIGH_OR_ABOVE = new Set([
  'chatgpt-web/high',
  'chatgpt-web/extra-high',
  'chatgpt-web/pro',
])

export function assertHighOrAboveForLiveTest(model) {
  if (!HIGH_OR_ABOVE.has(model)) {
    throw new Error(`ChatGPT real tests require High or above; refusing model ${JSON.stringify(model)}.`)
  }
  return model
}
