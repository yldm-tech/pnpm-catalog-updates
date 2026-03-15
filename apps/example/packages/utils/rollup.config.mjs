import resolve from '@rollup/plugin-node-resolve'
import typescript from '@rollup/plugin-typescript'

export default {
  input: 'src/index.ts',
  output: {
    file: 'dist/index.js',
    format: 'es',
    sourcemap: true,
  },
  external: ['chalk', 'lodash'],
  plugins: [resolve(), typescript({ tsconfig: './tsconfig.json' })],
}
