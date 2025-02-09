import resolve from '@rollup/plugin-node-resolve';
import { premove } from 'premove';
import { defineConfig } from 'rollup';
import esbuild from 'rollup-plugin-esbuild';
import UnpluginIsolatedDecl from 'unplugin-isolated-decl/rollup';
import packageJson from './package.json' with { type: 'json' };

const banner = `/**
 * prang
 *
 * @license MIT 2025-present Joery Münninghoff
 */
`;

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
    plugins: [cleanPlugin, UnpluginIsolatedDecl(), resolve(), esbuild()],
    treeshake: true,
    external: [...Object.keys(packageJson.dependencies), ...Object.keys(packageJson.peerDependencies)],
    output: {
        banner,
        dir: 'dist',
        format: 'esm'
    }
});
