import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: { index: 'src/index.ts' },
  format: ['esm'],
  dts: true,
  deps: { alwaysBundle: [/^codex-chatgpt-web(?:\\/|$)/] },
  outDir: 'lib',
  outExtensions: () => ({ js: '.js', dts: '.d.ts' }),
  outputOptions: {
    entryFileNames: '[name].js',
    chunkFileNames: 'chunks/[name]-[hash].js',
  },
})
