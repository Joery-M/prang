import { defineBuildConfig } from 'unbuild';

export default defineBuildConfig({
    declaration: 'node16',
    rollup: {
        inlineDependencies: true,
        commonjs: { exclude: ['**/*.d.ts'] }
    },
    stubOptions: {
        jiti: {
            tryNative: true,
            transformOptions: { async: false }
        }
    }
});
