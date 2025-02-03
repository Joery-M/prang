import { defineConfig } from 'rolldown';

export default defineConfig({
    input: ['./src/index.ts', './src/runtime.ts', './src/rxjs.ts'],
    treeshake: true,
    external: ['rxjs'],
    output: [
        {
            entryFileNames: (chunk) => chunk.name + '.cjs',
            sourcemap: true,
            format: 'cjs'
        },
        {
            entryFileNames: (chunk) => chunk.name + '.js',
            sourcemap: true,
            format: 'esm'
        }
    ]
});
