import { defineConfig } from 'vite';
import inspect from 'vite-plugin-inspect';
import { prang } from 'vite-plugin-prang';

export default defineConfig(() => {
    return {
        plugins: [inspect({ build: true }), prang()]
    };
});
