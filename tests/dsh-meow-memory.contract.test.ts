import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'

type JsonSchema = {
  type?: string
  additionalProperties?: boolean
  required?: string[]
  enum?: string[]
  properties?: Record<string, JsonSchema>
  items?: JsonSchema
}

const REQUIRED_TOOLS = [
  'memory_search',
  'memory_project',
  'memory_read',
  'memory_remember',
  'memory_update',
] as const

const EXPECTED_MEMORY_TOOLS = [
  'memory_dream',
  'memory_find_similar',
  'memory_project',
  'memory_read',
  'memory_remember',
  'memory_search',
  'memory_update',
] as const

type CapturedToolSchema = {
  name: string
  parameters: JsonSchema
}

function schemaMap(schemas: readonly CapturedToolSchema[]): Map<string, JsonSchema> {
  return new Map(schemas.map(tool => [
    tool.name,
    tool.parameters,
  ] as const))
}

describe('meow-memory 0.27.0 sibling-plugin contract on DSH 0.1.5-rc.2', () => {
  it('loads the real package and registers the expected memory tool schemas', async () => {
    const require = createRequire(import.meta.url)
    const manifestPath = require.resolve('meow-memory/package.json')
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
      name?: string
      version?: string
      repository?: { url?: string }
    }

    expect(manifest.name).toBe('meow-memory')
    expect(manifest.version).toBe('0.27.0')
    expect(manifest.repository?.url).toContain('Phant0Meow/dsh-meow-memory')

    const sandboxHome = mkdtempSync(join(tmpdir(), 'dsh-meow-contract-'))
    const previousHome = process.env.HOME
    const previousUserProfile = process.env.USERPROFILE
    process.env.HOME = sandboxHome
    process.env.USERPROFILE = sandboxHome

    const ctx = new Context()
    try {
      await ctx.plugin(SystemPrompt)
      await ctx.plugin(ToolRuntime)

      // Keep this a runtime import so the test exercises the installed package
      // instead of compiling against copied upstream declarations.
      const packageName = 'meow-memory'
      const meowMemory = await import(packageName)

      expect(meowMemory.name).toBe('meow-memory')
      expect(meowMemory.inject).toEqual(['tools'])

      await ctx.plugin(meowMemory, {
        enabled: true,
        promptLang: 'en',
        reflect: false,
        autoMigrate: false,
        projectDir: '.dsh-meow-contract',
        dream: { enabled: false },
      })

      let schemas: CapturedToolSchema[] | undefined
      await ctx.plugin({
        name: 'm2-meow-memory-schema-probe',
        inject: ['tools'],
        apply(probeCtx: Context) {
          schemas = probeCtx.tools.schemas()
            .filter(tool => tool.name.startsWith('memory_'))
            .map(tool => ({
              name: tool.name,
              parameters: tool.parameters as JsonSchema,
            }))
        },
      })

      if (schemas === undefined) {
        throw new Error('schema probe did not run with the tools service')
      }

      const memoryNames = schemas
        .map(tool => tool.name)
        .filter(name => name.startsWith('memory_'))
        .sort()

      expect(memoryNames).toEqual(EXPECTED_MEMORY_TOOLS)
      expect(memoryNames).toEqual(expect.arrayContaining([...REQUIRED_TOOLS]))

      const byName = schemaMap(schemas)

      const search = byName.get('memory_search')
      expect(search).toMatchObject({
        type: 'object',
        additionalProperties: false,
        required: ['query'],
      })
      expect(search?.properties?.query?.type).toBe('string')
      expect(search?.properties?.k?.type).toBe('integer')

      const project = byName.get('memory_project')
      expect(project).toMatchObject({
        type: 'object',
        additionalProperties: false,
        required: ['project'],
      })
      expect(project?.properties?.project?.type).toBe('string')

      const read = byName.get('memory_read')
      expect(read).toMatchObject({
        type: 'object',
        additionalProperties: false,
        required: ['id'],
      })
      expect(read?.properties?.id?.type).toBe('string')

      const remember = byName.get('memory_remember')
      expect(remember).toMatchObject({
        type: 'object',
        additionalProperties: false,
        required: ['content', 'project', 'keywords', 'importance'],
      })
      expect(remember?.properties?.content?.type).toBe('string')
      expect(remember?.properties?.project?.type).toBe('string')
      expect(remember?.properties?.keywords).toMatchObject({
        type: 'array',
        items: { type: 'string' },
      })
      expect(remember?.properties?.importance?.type).toBe('integer')

      const update = byName.get('memory_update')
      expect(update).toMatchObject({
        type: 'object',
        additionalProperties: false,
        required: ['id'],
      })
      expect(update?.properties?.id?.type).toBe('string')
      expect(update?.properties?.keywords).toMatchObject({
        type: 'array',
        items: { type: 'string' },
      })
      expect(update?.properties?.importance?.type).toBe('integer')
      expect(update?.properties?.status?.enum).toEqual(['active', 'archived', 'stale'])
    } finally {
      await ctx.fiber.dispose()
      if (previousHome === undefined) delete process.env.HOME
      else process.env.HOME = previousHome
      if (previousUserProfile === undefined) delete process.env.USERPROFILE
      else process.env.USERPROFILE = previousUserProfile
      rmSync(sandboxHome, { recursive: true, force: true })
    }
  })
})
