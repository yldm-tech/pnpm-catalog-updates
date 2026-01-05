import { cpSync, mkdirSync } from 'node:fs'
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  treeshake: true,
  minify: false,
  target: 'es2022',
  outDir: 'dist',
  tsconfig: './tsconfig.json',
  onSuccess: async () => {
    // Copy data files to dist
    mkdirSync('dist/error-handling/data', { recursive: true })
    cpSync(
      'src/error-handling/data/packageSuggestions.json',
      'dist/error-handling/data/packageSuggestions.json'
    )
  },
})
