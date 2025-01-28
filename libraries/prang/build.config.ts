import { defineBuildConfig } from 'unbuild';

export default defineBuildConfig({
    declaration: 'node16',
    stubOptions: {
        jiti: {
            tryNative: true,
            transformOptions: { async: false }
        }
    }
});
