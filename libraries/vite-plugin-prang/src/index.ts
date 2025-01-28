import type { Plugin } from 'vite';
import { ComponentScanPlugin } from './component/scan/component-scan-plugin';
import { ComponentTransformPlugin } from './component/transform/component-transform-plugin';
import { TemplateTransformPlugin } from './component/transform/template-transform-plugin';

export function prang(): Plugin[] {
    return [
        {
            name: 'prang',
            config(config, env) {
                return {
                    optimizeDeps: {
                        include: ['@prang/core/runtime']
                    },
                    define: {
                        __VUE_OPTIONS_API__: true,
                        __VUE_PROD_DEVTOOLS__: false,
                        __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: false
                    }
                };
            }
        },
        ComponentScanPlugin(),
        TemplateTransformPlugin(),
        ComponentTransformPlugin()
    ];
}
