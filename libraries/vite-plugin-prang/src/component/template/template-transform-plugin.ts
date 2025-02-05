import {
    ElementTypes,
    generate,
    getBaseTransformPreset,
    isCoreComponent,
    NodeTypes,
    transform,
    type ComponentNode,
    type RootNode,
    type TemplateChildNode,
    type TransformContext
} from '@vue/compiler-core';
import { basename } from 'pathe';
import { type SourceMapInput } from 'rollup';
import { kebabCase } from 'scule';
import { type Plugin } from 'vite';
import { ComponentMap, type ComponentMeta } from '../../internal';
import { parseTemplateRequest } from '../../utils';
import { baseParse } from './parser/parse';
import { transformPipe } from './transformPipe';
import { transformModel } from './vModel';

export function TemplateTransformPlugin(): Plugin {
    return {
        name: 'prang:template-transform',
        resolveId(id) {
            const req = parseTemplateRequest(id);
            if (req?.query.prang && (req.query.type === 'inline-template' || req.query.type === 'template')) {
                return id;
            }
        },
        load(id, options) {
            const request = parseTemplateRequest(id);
            if (!request?.query.prang || request.query.type !== 'inline-template' || !request.query.scopeId) return;
            const meta = ComponentMap.get(request.query.scopeId);

            const templateString = meta?.template?.source ?? '';
            const isProd = this.environment.mode === 'build';
            const result = compileTemplate(
                templateString,
                request.filename,
                request.query.scopeId,
                options?.ssr ?? false,
                isProd
            );

            return result;
        },
        transform(code, id, options) {
            const request = parseTemplateRequest(id);
            if (!request?.query.prang || request.query.type !== 'template') return;
            const isProd = this.environment.mode === 'build';
            const result = compileTemplate(
                code,
                request.filename,
                request.query.scopeId!,
                options?.ssr ?? false,
                isProd
            );

            return result;
        }
    };
}

function compileTemplate(code: string, path: string, scopeId: string, ssr: boolean, isProd: boolean) {
    const filename = basename(path);

    const meta = ComponentMap.get(scopeId);

    // Always required
    const prefixIdentifiers = true;

    const [nodeTransforms, directiveTransforms] = getBaseTransformPreset(prefixIdentifiers);

    const parsed = baseParse(code, {
        parseMode: 'base',
        prefixIdentifiers: true
    });

    transform(parsed, {
        inline: false,
        inSSR: ssr,
        hoistStatic: true,
        cacheHandlers: false,
        slotted: true,
        prefixIdentifiers,
        directiveTransforms: Object.assign({}, directiveTransforms, { model: transformModel }),
        scopeId,
        nodeTransforms: [transformPipe, ...nodeTransforms, importedComponentTransform(meta)]
    });
    const result = generate(parsed, {
        filename,
        ssr,
        sourceMap: true,
        mode: 'module',
        prefixIdentifiers,
        inline: false,
        inSSR: ssr,
        runtimeModuleName: '@prang/core/runtime',
        scopeId
    });
    // writeFileSync(
    //     fileURLToPath(import.meta.resolve('./file_' + Date.now() + '.json')),
    //     JSON.stringify(parsed, undefined, 4)
    // );

    return {
        code: result.code,
        map: result.map! as SourceMapInput
    };
}

function importedComponentTransform(meta?: ComponentMeta) {
    // Resolve all imported components by their selectors
    const components = new Set<string>();

    const allComponents = Array.from(ComponentMap.values());
    meta?.imports?.forEach((binding) => {
        allComponents.find((meta) => {
            if (meta.sourceId === binding.source) {
                if (meta.className) {
                    components.add(kebabCase(meta.className));
                    components.add(meta.className);
                }
                if (meta.selectors) {
                    meta.selectors.forEach((val) => {
                        components.add(val);
                    });
                }
            }
        });
    });

    return (node: RootNode | TemplateChildNode, ctx: TransformContext) => {
        // If the 'element' is part of our selectors, treat is as a component
        if (node.type == NodeTypes.ELEMENT && node.tagType === ElementTypes.ELEMENT) {
            if (!isCoreComponent(node.tag) && components.has(node.tag)) {
                ctx.replaceNode({
                    ...(node as unknown as ComponentNode),
                    tagType: ElementTypes.COMPONENT
                });
            }
        }
    };
}
