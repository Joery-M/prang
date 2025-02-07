import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';
import typescript from '@rollup/plugin-typescript';
import { join } from 'path';
import { premove } from 'premove';
import dts from 'rollup-plugin-dts';
import { defineConfig } from 'rollup';
import esbuild from 'rollup-plugin-esbuild';

const banner = `/**
 * @prang/core
 * 
 * @license MIT
 */
`;

const external = ['rxjs', '@vue/reactivity', '@vue/runtime-dom', '@vue/shared', '@vueuse/rxjs'];

export default defineConfig([
    // Generate types
    {
        input: ['./src/index.ts', './src/runtime.ts', './src/rxjs.ts'],
        external,
        plugins: [
            {
                async buildStart() {
                    await premove(join(import.meta.dirname, './temp/'));
                }
            },
            typescript({
                tsconfig: './tsconfig.json'
            })
        ],
        output: { dir: 'temp' }
    },
    // Bundle types
    {
        input: ['./temp/index.d.ts', './temp/runtime.d.ts', './temp/rxjs.d.ts'],
        plugins: [
            dts(),
            {
                async buildEnd() {
                    await premove(join(import.meta.dirname, './temp/'));
                }
            }
        ],
        output: {
            entryFileNames: (chunk) => {
                return chunk.name.replace(/temp(\\|\/)/, '') + '.d.ts';
            },
            banner,
            dir: 'dist',
            format: 'esm'
        }
    },
    // Generate TS
    {
        input: ['./src/index.ts', './src/runtime.ts', './src/rxjs.ts'],
        plugins: [resolve(), esbuild(), commonjs()],
        treeshake: true,
        external,
        output: {
            entryFileNames: (chunk) => chunk.name + '.js',
            banner,
            dir: 'dist',
            format: 'esm'
        }
    }
]);
