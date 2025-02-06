import resolve from '@rollup/plugin-node-resolve';
import { defineConfig } from 'rollup';
import commonjs from 'rollup-plugin-commonjs';
import esbuild from 'rollup-plugin-esbuild';

const banner = `/**
 * @prang/core
 * 
 * @license MIT
 */
`;

export default defineConfig({
    input: ['./src/index.ts', './src/runtime.ts', './src/rxjs.ts'],
    plugins: [resolve(), esbuild(), commonjs()],
    treeshake: true,
    external: ['rxjs', '@vue/reactivity', '@vue/runtime-dom', '@vue/shared'],
    output: {
        entryFileNames: (chunk) => chunk.name + '.js',
        banner,
        dir: 'dist',
        sourcemap: true,
        format: 'esm'
    }
});
