import { CodeGenerator } from '@babel/generator';
import { identifier, isExportNamedDeclaration, isFunctionDeclaration, isThisExpression } from '@babel/types';
import {
    createInterpolation,
    ElementTypes,
    generate,
    getBaseTransformPreset,
    isCoreComponent,
    NodeTypes,
    transform,
    transformExpression as vTransformExpression,
    type ComponentNode,
    type RootNode,
    type TemplateChildNode,
    type TransformContext
} from '@vue/compiler-core';
import { babelParse, walkAST } from 'ast-kit';
import MagicString from 'magic-string';
import { basename } from 'pathe';
import { type SourceMapInput } from 'rollup';
import { kebabCase } from 'scule';
import { type Plugin } from 'vite';
import { ComponentMap, type ComponentMeta } from '../../internal';
import { dedent, parseTemplateRequest, stry } from '../../utils';
import { baseParse } from './parser/parse';
import { transformExpression } from './transformExpression';
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
    const i = nodeTransforms.indexOf(vTransformExpression);
    nodeTransforms[i] = transformExpression;

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
        bindingMetadata: meta?.bindings,
        prefixIdentifiers,
        directiveTransforms: Object.assign({}, directiveTransforms, { model: transformModel }),
        scopeId,
        nodeTransforms: [transformPipe, ...nodeTransforms, importedComponentTransform(meta), thisCallTransform]
    });
    const result = generate(parsed, {
        filename,
        ssr,
        sourceMap: true,
        mode: 'module',
        prefixIdentifiers,
        bindingMetadata: meta?.bindings,
        inline: false,
        inSSR: ssr,
        runtimeModuleName: '@prang/core/runtime',
        scopeId
    });

    const s = new MagicString(result.code);
    const ast = babelParse(result.code);
    walkAST(ast, {
        enter(node, parent, key, index) {
            if (isExportNamedDeclaration(node) && isFunctionDeclaration(node.declaration)) {
                // Append getting correct _ctx
                s.appendRight(
                    node.declaration.body.start! + 1,
                    dedent`\n
                    _ctx.$ && (_ctx = _ctx.$.setupState)
                    `
                );
            }
        }
    });

    if (meta?.bindings) {
        s.append(
            '\n\n/**\n * Analyzed bindings:\n' +
                JSON.stringify(meta?.bindings, undefined, 2).replace(/^(.+)/gm, ' * $1') +
                '\n */\n'
        );
    }

    s.append(
        dedent`
            \nimport.meta.hot.on('file-changed', ({ file }) => {
                __VUE_HMR_RUNTIME__.CHANGED_FILE = file
            });
            import.meta.hot.accept(mod => {
                if (!mod) return;
                const { render: updated } = mod;
                console.log('template update')
                __VUE_HMR_RUNTIME__.rerender(${stry(scopeId)}, updated);
            })
        `
    );
    return {
        code: s.toString(),
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

function thisCallTransform(node: RootNode | TemplateChildNode, ctx: TransformContext) {
    if (node.type !== NodeTypes.INTERPOLATION || !node.content.ast) return;
    let changed = false;
    const newAST = walkAST(node.content.ast, {
        enter(n, parent, key, index) {
            if (isThisExpression(n)) {
                changed = true;
                this.replace(identifier('_ctx'));
            }
        }
    });
    if (changed) {
        const generated = new CodeGenerator(newAST!).generate();
        console.log(generated);
        ctx.replaceNode(createInterpolation(generated.code, node.content.loc));
    }
}
