import { createHash } from 'node:crypto'

export function summarizeDiagnosticError(error) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      ...(typeof error.code === 'string' ? { code: error.code } : {}),
      ...(error.stack ? { stack: error.stack } : {}),
    }
  }
  return { message: String(error) }
}

export function boundedReasoningEnvelopeDiagnostic(rawText, error) {
  const maxPreviewChars = 2048
  const headChars = 1536
  const tailChars = 512
  const preview = rawText.length <= maxPreviewChars
    ? rawText
    : rawText.slice(0, headChars)
      + '\n…<truncated ' + (rawText.length - maxPreviewChars) + ' chars>…\n'
      + rawText.slice(-tailChars)

  return {
    rawLength: rawText.length,
    sha256: createHash('sha256').update(rawText, 'utf8').digest('hex'),
    startsWithBrace: rawText.trimStart().startsWith('{'),
    endsWithBrace: rawText.trimEnd().endsWith('}'),
    fenceMarkerCount: rawText.split('```').length - 1,
    preview,
    parseError: summarizeDiagnosticError(error),
  }
}
