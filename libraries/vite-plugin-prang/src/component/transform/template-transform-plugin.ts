import {
    ElementTypes,
    getBaseTransformPreset,
    isCoreComponent,
    NodeTypes,
    generate,
    transform,
    type ComponentNode,
    type RootNode,
    type TemplateChildNode,
    type TransformContext
} from '@vue/compiler-core';
import {} from '@vue/compiler-dom';
// import { compileTemplate as sfcCompileTemplate } from '@vue/compiler-sfc';
import { parse } from 'node:path';
import { type SourceMapInput } from 'rollup';
import { kebabCase } from 'scule';
import { type Plugin } from 'vite';
import { ComponentMap, type ComponentMeta } from '../../internal';
import { baseParse } from '../../template/parse';
import { parseTemplateRequest } from '../../utils';
import { transformPipe } from './transformPipe';
import { transformModel } from './vModel';

export enum BindingTypes {
    /**
     * returned from data()
     */
    DATA = 'data',
    /**
     * declared as a prop
     */
    PROPS = 'props',
    /**
     * a local alias of a `<script setup>` destructured prop.
     * the original is stored in __propsAliases of the bindingMetadata object.
     */
    PROPS_ALIASED = 'props-aliased',
    /**
     * a let binding (may or may not be a ref)
     */
    SETUP_LET = 'setup-let',
    /**
     * a const binding that can never be a ref.
     * these bindings don't need `unref()` calls when processed in inlined
     * template expressions.
     */
    SETUP_CONST = 'setup-const',
    /**
     * a const binding that does not need `unref()`, but may be mutated.
     */
    SETUP_REACTIVE_CONST = 'setup-reactive-const',
    /**
     * a const binding that may be a ref.
     */
    SETUP_MAYBE_REF = 'setup-maybe-ref',
    /**
     * bindings that are guaranteed to be refs
     */
    SETUP_REF = 'setup-ref',
    /**
     * declared by other options, e.g. computed, inject
     */
    OPTIONS = 'options',
    /**
     * a literal constant, e.g. 'foo', 1, true
     */
    LITERAL_CONST = 'literal-const',
    SIGNAL = 'setup-signal'
}

export function TemplateTransformPlugin(): Plugin {
    return {
        name: 'prang:template-transform',
        resolveId(id) {
            const req = parseTemplateRequest(id);
            if (req?.query.prang) {
                return id;
            }
        },
        load(id, options) {
            const request = parseTemplateRequest(id);
            if (!request?.query.prang || !request.query.inline || !request.query.scopeId) return;
            const meta = ComponentMap.get(request.query.scopeId);

            const templateString = meta?.template ?? '';
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
            if (!request?.query.prang || request.query.inline) return;
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
    const filename = parse(path).name + parse(path).ext;

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
