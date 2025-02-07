import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';
import { premove } from 'premove';
import { defineConfig } from 'rollup';
import esbuild from 'rollup-plugin-esbuild';
import UnpluginIsolatedDecl from 'unplugin-isolated-decl/rollup';

const banner = `/**
 * @prang/core
 * 
 * @license MIT
 */
`;

const external = ['rxjs', '@vue/reactivity', '@vue/runtime-dom', '@vue/shared', '@vueuse/rxjs'];

/**
 * @type {import('rollup').Plugin}
 */
const cleanPlugin = {
    async buildStart() {
        await premove('./dist/', { cwd: import.meta.dirname });
    }
};

export default defineConfig({
    input: ['./src/index.ts', './src/runtime.ts', './src/rxjs.ts'],
    plugins: [cleanPlugin, UnpluginIsolatedDecl(), resolve(), esbuild(), commonjs()],
    treeshake: true,
    external,
    output: {
        banner,
        dir: 'dist',
        format: 'esm'
    }
});
