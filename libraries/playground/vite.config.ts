import { defineConfig } from 'vite';
import inspect from 'vite-plugin-inspect';
// import { prang } from 'vite-plugin-prang';
import { prang } from '../vite-plugin-prang/src/index';

export default defineConfig(() => {
    return {
        plugins: [inspect({ build: true }), prang()],
        css: {
            devSourcemap: true
        }
    };
});
