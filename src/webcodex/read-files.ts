import { readFile, stat } from 'node:fs/promises'
import type { Context } from '@deepseek-ai/cordis'
import { HarnessError } from '@deepseek-ai/dsh-llm'
import { defineTool } from '@deepseek-ai/dsh-tools'

export const WEBCODEX_READ_FILES_TOOL = 'webcodex_read_files'
export const WEBCODEX_READ_FILES_ACTION_PATH = '/api/actions/read_files'

export interface WebCodexReadFilesItem {
  path: string
  start_line?: number
  limit?: number
  expected_read_revision?: number
}

export interface WebCodexReadFilesArguments {
  items: WebCodexReadFilesItem[]
  with_line_numbers?: boolean
  max_result_bytes?: number
}

export type WebCodexJsonValue =
  | null
  | boolean
  | number
  | string
  | WebCodexJsonValue[]
  | { [key: string]: WebCodexJsonValue }

export interface WebCodexToolResult {
  success: boolean
  output: WebCodexJsonValue
  error?: string
}

export interface WebCodexReadFilesSeamOptions {
  /** WebCodex Server base URL, for example http://127.0.0.1:8080. */
  baseUrl: string
  /** Inline WebCodex Bearer credential. Prefer bearerTokenFile for Desktop managed pairing. */
  bearerToken?: string
  /** Protected file containing the WebCodex Bearer credential. Its contents are never rendered. */
  bearerTokenFile?: string
  /** Exact registered WebCodex Project id pinned to this DSH capability. */
  project: string
  /** Test seam only; production uses globalThis.fetch. */
  fetch?: typeof fetch
}

export class WebCodexCredentialError extends HarnessError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, 'WEBCODEX_CREDENTIAL_ERROR', options)
  }
}

export class WebCodexHttpError extends HarnessError {
  readonly status: number
  readonly responseBody: unknown

  constructor(status: number, message: string, responseBody: unknown, options?: ErrorOptions) {
    super(message, 'WEBCODEX_HTTP_ERROR', options)
    this.status = status
    this.responseBody = responseBody
  }
}

function requireNonEmpty(value: string, label: string): string {
  const trimmed = value.trim()
  if (trimmed.length === 0) throw new TypeError(`${label} must be non-empty`)
  return trimmed
}

const MAX_BEARER_TOKEN_FILE_BYTES = 4096

function credentialSource(options: WebCodexReadFilesSeamOptions): 'inline' | 'file' {
  const inline = options.bearerToken !== undefined
  const file = options.bearerTokenFile !== undefined
  if (inline === file) {
    throw new TypeError('configure exactly one WebCodex bearer credential source: bearerToken or bearerTokenFile')
  }
  if (inline) {
    requireNonEmpty(options.bearerToken ?? '', 'WebCodex bearerToken')
    return 'inline'
  }
  requireNonEmpty(options.bearerTokenFile ?? '', 'WebCodex bearerTokenFile')
  return 'file'
}

async function resolveBearerToken(options: WebCodexReadFilesSeamOptions): Promise<string> {
  if (credentialSource(options) === 'inline') {
    return requireNonEmpty(options.bearerToken ?? '', 'WebCodex bearerToken')
  }

  const path = requireNonEmpty(options.bearerTokenFile ?? '', 'WebCodex bearerTokenFile')
  try {
    const info = await stat(path)
    if (!info.isFile()) {
      throw new WebCodexCredentialError(`WebCodex bearer credential path is not a file: ${path}`)
    }
    if (info.size <= 0 || info.size > MAX_BEARER_TOKEN_FILE_BYTES) {
      throw new WebCodexCredentialError(
        `WebCodex bearer credential file size is outside the accepted 1..${MAX_BEARER_TOKEN_FILE_BYTES} byte range: ${path}`,
      )
    }
    const token = (await readFile(path, 'utf8')).trim()
    if (token.length === 0) {
      throw new WebCodexCredentialError(`WebCodex bearer credential file is empty: ${path}`)
    }
    return token
  } catch (error) {
    if (error instanceof WebCodexCredentialError) throw error
    throw new WebCodexCredentialError(
      `WebCodex bearer credential file could not be read: ${path}`,
      { cause: error },
    )
  }
}

function actionUrl(baseUrl: string): string {
  const parsed = new URL(requireNonEmpty(baseUrl, 'WebCodex baseUrl'))
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new TypeError('WebCodex baseUrl must use http or https')
  }
  return new URL(WEBCODEX_READ_FILES_ACTION_PATH, parsed).toString()
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function canonicalToolResult(value: unknown): WebCodexToolResult | undefined {
  if (!isObject(value) || typeof value.success !== 'boolean' || !Object.hasOwn(value, 'output')) {
    return undefined
  }
  if (Object.hasOwn(value, 'error') && typeof value.error !== 'string') return undefined
  if (!value.success && typeof value.error !== 'string') return undefined
  return {
    success: value.success,
    output: value.output as WebCodexJsonValue,
    ...(typeof value.error === 'string' ? { error: value.error } : {}),
  }
}

function responseErrorMessage(status: number, body: unknown): string {
  if (isObject(body) && typeof body.error === 'string' && body.error.length > 0) {
    return `WebCodex HTTP ${status}: ${body.error}`
  }
  return `WebCodex HTTP ${status} returned a non-ToolResult response`
}

function readFilesRequest(project: string, args: WebCodexReadFilesArguments): Record<string, unknown> {
  return {
    project,
    items: args.items,
    ...(args.with_line_numbers === undefined ? {} : { with_line_numbers: args.with_line_numbers }),
    ...(args.max_result_bytes === undefined ? {} : { max_result_bytes: args.max_result_bytes }),
  }
}

/**
 * Call the canonical WebCodex GPT-Action adapter for the real read_files ToolRuntime tool.
 * There is deliberately no retry: the caller owns retry policy, and future effectful seams
 * must reconcile outcome-unknown before repeating an operation.
 */
export async function invokeWebCodexReadFiles(
  options: WebCodexReadFilesSeamOptions,
  args: WebCodexReadFilesArguments,
  signal: AbortSignal,
): Promise<WebCodexToolResult> {
  const token = await resolveBearerToken(options)
  const project = requireNonEmpty(options.project, 'WebCodex project')
  const requestBody = readFilesRequest(project, args)
  const fetchImpl = options.fetch ?? globalThis.fetch

  let response: Response
  try {
    response = await fetchImpl(actionUrl(options.baseUrl), {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(requestBody),
      signal,
      redirect: 'error',
    })
  } catch (error) {
    throw new HarnessError(
      `WebCodex read_files transport failed: ${error instanceof Error ? error.message : String(error)}`,
      'WEBCODEX_TRANSPORT_ERROR',
      { cause: error },
    )
  }

  const raw = await response.text()
  let body: unknown
  try {
    body = JSON.parse(raw)
  } catch (error) {
    throw new WebCodexHttpError(
      response.status,
      `WebCodex HTTP ${response.status} returned non-JSON data`,
      raw,
      { cause: error },
    )
  }

  const result = canonicalToolResult(body)
  if (result !== undefined) {
    if (response.ok !== result.success) {
      throw new WebCodexHttpError(
        response.status,
        `WebCodex HTTP status/result mismatch (status ${response.status}, success=${result.success})`,
        body,
      )
    }
    return result
  }

  throw new WebCodexHttpError(
    response.status,
    responseErrorMessage(response.status, body),
    body,
  )
}

/**
 * Register the first read-only DSH -> WebCodex durable-body seam.
 *
 * The DSH call succeeds when it obtains a canonical WebCodex ToolResult. Business truth remains
 * inside that exact value: callers MUST branch on value.success. A WebCodex success=false value is
 * intentionally not converted to prose or thrown away, because its structured output may contain
 * the authoritative recovery instruction.
 */
export function registerWebCodexReadFilesTool(
  ctx: Context,
  options: WebCodexReadFilesSeamOptions,
): () => void {
  requireNonEmpty(options.project, 'WebCodex project')
  credentialSource(options)
  actionUrl(options.baseUrl)

  return ctx.tools.register(defineTool({
    name: WEBCODEX_READ_FILES_TOOL,
    description: 'Read bounded UTF-8 ranges from one operator-pinned WebCodex Project. The returned value is the canonical WebCodex ToolResult; its success field is authoritative, including structured failures/recovery data.',
    parameters: {
      items: {
        type: 'array',
        required: true,
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            path: { type: 'string', required: true },
            start_line: { type: 'integer' },
            limit: { type: 'integer' },
            expected_read_revision: { type: 'integer' },
          },
        },
      },
      with_line_numbers: { type: 'boolean' },
      max_result_bytes: { type: 'integer' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          success: { type: 'boolean', required: true },
          output: { type: 'json', required: true },
          error: { type: 'string' },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: JSON.stringify(value),
      }],
    },
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      return invokeWebCodexReadFiles(options, args, exec.signal)
    },
  }))
}
