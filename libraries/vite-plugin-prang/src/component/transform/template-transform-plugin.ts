import {
    buildDirectiveArgs,
    buildProps,
    createArrayExpression,
    createVNodeCall,
    ElementTypes,
    getVNodeHelper,
    NodeTypes,
    type DirectiveArguments,
    type RootNode,
    type TemplateChildNode,
    type TransformContext
} from '@vue/compiler-core';
import { compileTemplate as sfcCompileTemplate } from '@vue/compiler-sfc';
import MagicString from 'magic-string';
import { parse } from 'node:path';
import { type Plugin } from 'vite';
import { ComponentMap, type ComponentMeta } from '../../internal';
import { baseParse } from '../../template/parse';
import { parseTemplateRequest } from '../../utils';
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
            if (!request?.query.prang || !request.query.inline) return;
            const meta = ComponentMap.get(request.query.scopeId!);

            const templateString = meta?.template ?? '';
            const isProd = this.environment.mode === 'build';
            const result = compileTemplate(
                templateString,
                request.filename,
                request.query.scopeId!,
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

    const parsed = baseParse(code, {
        compatConfig: { COMPILER_FILTERS: true }
    });
    const result = sfcCompileTemplate({
        filename,
        id: path,
        source: code,
        ast: parsed,
        isProd: true,
        compilerOptions: {
            mode: 'module',
            inline: false,
            parseMode: 'base',
            inSSR: ssr,
            hoistStatic: true,
            runtimeModuleName: '@prang/core/runtime',
            cacheHandlers: false,
            directiveTransforms: { model: transformModel },
            scopeId,
            nodeTransforms: [importedComponentTransform(meta)]
        }
    });
    const s = new MagicString(result.code, { filename });

    if (meta?.imports) {
        meta.imports.forEach((imp) => {
            if (imp.isType) return;

            if (imp.imported === 'default') {
                s.prepend(`import ${imp.local} from ${JSON.stringify(imp.source)};\n`);
            } else s.prepend(`import {${imp.imported} as ${imp.local}} from ${JSON.stringify(imp.source)};\n`);
        });
    }

    return {
        code: s.toString(),
        map: s.generateMap()
    };
}

function importedComponentTransform(meta?: ComponentMeta) {
    return (node: RootNode | TemplateChildNode, ctx: TransformContext) => {
        if (node.type == NodeTypes.ELEMENT && node.tagType == ElementTypes.COMPONENT) {
            if (meta?.imports && meta.imports.some((imp) => imp.local == node.tag)) {
                const props = buildProps(node, ctx, undefined, true, false);
                const directives =
                    props.directives && props.directives.length
                        ? createArrayExpression(props.directives.map((dir) => buildDirectiveArgs(dir, ctx)))
                        : undefined;

                const vnode = createVNodeCall(
                    ctx,
                    node.tag + '.comp',
                    props.props,
                    node.children.length > 0 ? node.children : undefined,
                    props.patchFlag === 0 ? undefined : props.patchFlag,
                    stringifyDynamicPropNames(props.dynamicPropNames),
                    directives as DirectiveArguments | undefined,
                    !!props.shouldUseBlock,
                    false,
                    true,
                    node.loc
                );
                ctx.helper(getVNodeHelper(ctx.inSSR, true));
                ctx.replaceNode(vnode as any);
            }
        }
    };
}

function stringifyDynamicPropNames(props: string[]) {
    if (props.length == 0) {
        return undefined;
    }
    let propsNamesString = `[`;
    for (let i = 0, l = props.length; i < l; i++) {
        propsNamesString += JSON.stringify(props[i]);
        if (i < l - 1) propsNamesString += ', ';
    }
    return propsNamesString + `]`;
}
