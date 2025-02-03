import type { Plugin } from 'vite';
import { ComponentScanPlugin } from './component/component-scan-plugin';
import { TemplateTransformPlugin } from './component/template/template-transform-plugin';

export function prang(): Plugin[] {
    return [
        {
            name: 'prang',
            config() {
                return {
                    optimizeDeps: {
                        include: ['@prang/core/runtime']
                    },
                    define: {
                        __VUE_OPTIONS_API__: false,
                        __VUE_PROD_DEVTOOLS__: false,
                        __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: false
                    }
                };
            }
        },
        ComponentScanPlugin(),
        TemplateTransformPlugin()
    ];
}
