import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';
import { defineConfig } from 'rollup';
import { dts } from 'rollup-plugin-dts';
import esbuild from 'rollup-plugin-esbuild';

const banner = `/**
 * vite-plugin-prang
 * 
 * @license MIT
 */
`;

export default defineConfig([
    {
        input: './src/index.ts',
        plugins: [dts()],
        output: { file: 'dist/index.d.ts', format: 'es' }
    },
    {
        input: './src/index.ts',
        plugins: [resolve(), esbuild(), commonjs()],
        treeshake: true,
        external: [
            '@babel/generator',
            '@babel/parser',
            '@babel/types',
            '@vue/compiler-core',
            '@vue/compiler-dom',
            '@vue/compiler-sfc',
            '@vue/shared',
            'entities',
            'magic-string',
            'rollup',
            'vite'
        ],
        output: {
            entryFileNames: (chunk) => chunk.name + '.js',
            banner,
            dir: 'dist',
            format: 'esm'
        }
    }
]);
