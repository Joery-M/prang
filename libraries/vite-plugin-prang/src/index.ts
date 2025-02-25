import { parseCache } from 'ast-kit';
import { readFile } from 'fs/promises';
import { createFilter, normalizePath, perEnvironmentState, type Plugin } from 'vite';
import { getModuleInfo } from './classes/classes';
import { componentTransform } from './classes/component';
import { ClassMetaMap, ClassType } from './internal';
import { compileStyle } from './style/style';
import { compileTemplate } from './template/template';
import { parseTemplateRequest, type ComponentQuery, type TemplateRequest } from './utils';

const GlobalFilter = createFilter([/\0/, '**/node_modules/**']);
const ClassFileFilter = createFilter(/\.[tj]sx?$/, /\?prang/);

export function prang(): Plugin {
    ClassMetaMap.clear();
    parseCache.clear();

    const useHMR = perEnvironmentState((env) => env.mode === 'dev' && env.config.server.hmr !== false);
    return {
        name: 'prang',
        enforce: 'pre',
        config() {
            return {
                optimizeDeps: {
                    include: ['prang/runtime']
                },
                define: {
                    __VUE_OPTIONS_API__: false,
                    __VUE_PROD_DEVTOOLS__: false,
                    __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: false
                }
            };
        },
        resolveId(id) {
            if (GlobalFilter(id)) return;

            const req = parseTemplateRequest(id);
            if (req?.query.prang) {
                return id;
            }
        },
        async load(id) {
            if (GlobalFilter(id)) return;

            const request: TemplateRequest = parseTemplateRequest(id);
            const meta = request.query.scopeId ? ClassMetaMap.get(request.query.scopeId) : undefined;

            if (request.query.prang && meta?.type === ClassType.COMPONENT) {
                const query: ComponentQuery = { request, meta };
                if (request.query.type === 'inline-template') {
                    // Inline template
                    const templateString = meta?.template?.source;
                    if (!templateString) return;

                    return compileTemplate(templateString, query, false, useHMR(this));
                } else if (
                    request.query.type === 'inline-style' &&
                    meta.styles?.length &&
                    request.query.styleIndex != null
                ) {
                    const currentStyle = meta.styles[request.query.styleIndex];
                    return compileStyle(currentStyle.code, query, this);
                }
            } else if (ClassFileFilter(id)) {
                const strippedId = id.split('?')[0];

                const code = await readFile(id, { flag: 'r', encoding: 'utf-8' });
                if (!code.includes('prang') || !code.includes('class')) {
                    return;
                }
                const mappedComponents = await getModuleInfo(code, strippedId, this);
                for (const [s, m] of mappedComponents) {
                    ClassMetaMap.set(s, m);
                }
            }
        },
        transform(code, id) {
            if (GlobalFilter(id)) return;

            const request = parseTemplateRequest(id);
            const meta = request.query.scopeId ? ClassMetaMap.get(request.query.scopeId) : undefined;

            if (request.query.prang && meta?.type === ClassType.COMPONENT) {
                const query: ComponentQuery = { request, meta };
                if (request.query.type === 'template') {
                    // Template compile
                    return compileTemplate(code, query, false, useHMR(this));
                } else if (request.query.type === 'style') {
                    // Style compile
                    return compileStyle(code, query, this);
                }
            } else if (ClassFileFilter(id)) {
                return componentTransform(code, id, useHMR(this));
            }
        },
        handleHotUpdate(ctx) {
            ctx.server.ws.send({
                type: 'custom',
                event: 'file-changed',
                data: { file: normalizePath(ctx.file) }
            });
        }
    };
}
