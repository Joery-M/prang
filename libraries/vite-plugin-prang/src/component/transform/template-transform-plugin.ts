import {
    baseCompile,
    BindingTypes,
    buildDirectiveArgs,
    buildProps,
    createArrayExpression,
    createVNodeCall,
    ElementTypes,
    getVNodeHelper,
    NodeTypes,
    type DirectiveArguments
} from '@vue/compiler-core';
import MagicString from 'magic-string';
import { parse } from 'node:path';
import { type Plugin } from 'vite';
import { ComponentMap } from '../../internal';
import { baseParse } from '../../template/parse';
import { parseTemplateRequest } from '../../utils';
import { transformModel } from './vModel';

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
            const result = compileTemplate(
                templateString,
                request.filename,
                request.query.scopeId!,
                options?.ssr ?? false
            );

            return result;
        },
        transform(code, id, options) {
            const request = parseTemplateRequest(id);
            if (!request?.query.prang || request.query.inline) return;
            const result = compileTemplate(code, request.filename, request.query.scopeId!, options?.ssr ?? false);

            return result;
        }
    };
}

function compileTemplate(code: string, path: string, scopeId: string, ssr: boolean) {
    const filename = parse(path).name + parse(path).ext;
    const s = new MagicString(code, { filename });

    const meta = ComponentMap.get(scopeId);

    const parsed = baseParse(code, {
        compatConfig: { COMPILER_FILTERS: true }
    });
    const result = baseCompile(parsed, {
        inline: false,
        mode: 'module',
        compatConfig: { COMPILER_FILTERS: true },
        scopeId,
        filename,
        runtimeModuleName: '@prang/core/runtime',
        directiveTransforms: { model: transformModel },
        nodeTransforms: [
            (node, ctx) => {
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
                            node.children,
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
            }
        ],
        hoistStatic: true,
        inSSR: ssr
    });

    s.remove(0, code.length);
    s.append(result.code);

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
        map: s.generateMap({ includeContent: true })
    };
}

function stringifyDynamicPropNames(props: string[]) {
    let propsNamesString = `[`;
    for (let i = 0, l = props.length; i < l; i++) {
        propsNamesString += JSON.stringify(props[i]);
        if (i < l - 1) propsNamesString += ', ';
    }
    return propsNamesString + `]`;
}
