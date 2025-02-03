import type { Plugin } from 'vite';
import { ComponentScanPlugin } from './component/component-scan-plugin';
import { TemplateTransformPlugin } from './component/template/template-transform-plugin';
import { ComponentStyleTransform } from './component/style/style-transform-plugin';
import { ComponentMap } from './internal';

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
            },
            buildStart() {
                ComponentMap.clear();
            },
            buildEnd() {
                ComponentMap.clear();
            }
        },
        ComponentStyleTransform(),
        ComponentScanPlugin(),
        TemplateTransformPlugin()
    ];
}
