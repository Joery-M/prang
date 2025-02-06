import { normalizePath, type Plugin } from 'vite';
import { ComponentScanPlugin } from './component/component-scan-plugin';
import { ComponentStyleTransform } from './component/style/style-transform-plugin';
import { TemplateTransformPlugin } from './component/template/template-transform-plugin';
import { ComponentMap } from './internal';

export function prang(): Plugin[] {
    ComponentMap.clear();
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
            handleHotUpdate(ctx) {
                ctx.server.ws.send({
                    type: 'custom',
                    event: 'file-changed',
                    data: { file: normalizePath(ctx.file) }
                });
            }
        },
        ComponentStyleTransform(),
        ComponentScanPlugin(),
        TemplateTransformPlugin()
    ];
}
