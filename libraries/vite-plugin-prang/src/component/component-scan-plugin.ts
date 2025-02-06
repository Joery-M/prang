import {
    isArrayExpression,
    isCallExpression,
    isClassMethod,
    isClassProperty,
    isIdentifier,
    isImportDeclaration,
    isLiteral,
    isObjectExpression,
    isObjectProperty,
    isTemplateLiteral,
    objectExpression,
    toKeyAlias,
    type ClassDeclaration,
    type ClassProperty,
    type Expression,
    type ObjectExpression
} from '@babel/types';
import { BindingTypes, type BindingMetadata } from '@vue/compiler-core';
import { camelize } from '@vue/shared';
import {
    babelParse,
    isCallOf,
    isIdentifierOf,
    isLiteralType,
    parseCache,
    resolveIdentifier,
    resolveLiteral,
    resolveString,
    resolveTemplateLiteral,
    walkAST,
    walkASTAsync,
    walkImportDeclaration,
    type ImportBinding
} from 'ast-kit';
import { readFile } from 'fs/promises';
import MagicString from 'magic-string';
import path from 'pathe';
import type { PluginContext } from 'rollup';
import { type Plugin } from 'vite';
import { ComponentMap, type ComponentMeta } from '../internal';
import { dedent, getHash, stry } from '../utils';

export function ComponentScanPlugin(): Plugin {
    parseCache.clear();

    return {
        name: 'prang:component-scan',
        enforce: 'pre',
        cacheKey: 'prang:component-scan',
        async load(id) {
            if (id.includes('\0') || id.includes('/node_modules/') || id.includes('?prang') || !/\.[tj]sx?$/.test(id))
                return;
            const strippedId = path.resolve(id);

            const code = (await readFile(id)).toString();
            if (!code.includes('@prang/core') || !code.includes('class')) {
                return;
            }
            const mappedComponents = await getModuleInfoFromCode(code, strippedId, this);
            for (const [s, m] of Object.entries(mappedComponents)) {
                ComponentMap.set(s, m);
            }
        },
        async transform(code, id) {
            if (
                id.includes('\0') ||
                id.includes('/node_modules/') ||
                id.includes('?prang') ||
                !code.includes('@prang/core') ||
                !code.includes('class')
            )
                return;

            const ast = babelParse(code, path.extname(id), {
                cache: true,
                sourceType: 'module',
                sourceFilename: id,
                errorRecovery: true,
                plugins: [
                    'jsx',
                    'typescript',
                    ['decorators', { allowCallParenthesized: true, decoratorsBeforeExport: true }],
                    'decoratorAutoAccessors',
                    'exportDefaultFrom',
                    'functionBind',
                    'importAssertions'
                ]
            });

            const s = new MagicString(code, { filename: id });
            const imports: Record<string, ImportBinding> = {};
            const useHMR = this.environment.mode == 'dev' && this.environment.config.server.hmr !== false;
            let classDeclarationIndex = -1;

            const importedHelpers = new Map<string, string>();
            const ctx = this;
            walkAST(ast, {
                enter(node) {
                    switch (node.type) {
                        case 'ImportDeclaration': {
                            walkImportDeclaration(imports, node);
                            break;
                        }
                        case 'ClassDeclaration': {
                            classDeclarationIndex++;

                            const scopeId = getHash(id + '#' + classDeclarationIndex);
                            const meta = ComponentMap.get(scopeId);
                            const decorator = node.decorators?.[0];
                            if (!meta || !decorator || !isCallExpression(decorator.expression)) break;
                            const helper = (helper: string) => {
                                const localVal = '_' + helper;
                                importedHelpers.set(helper, localVal);
                                return localVal;
                            };

                            let arg: ObjectExpression | undefined = isObjectExpression(
                                decorator.expression.arguments[0]
                            )
                                ? decorator.expression.arguments[0]
                                : undefined;

                            let insertedObj = false;
                            if (!arg) {
                                s.prependLeft(decorator.expression.end! - 1, '{\n');
                                arg = objectExpression([]);
                                arg.start = decorator.expression.end! - 1;
                                insertedObj = true;
                            }
                            const propsResult = resolveProps(node, s, imports, helper);

                            for (const deleteLoc of meta.deleteLocs) {
                                const charAfter = s.original.charAt(deleteLoc.end.index);
                                s.remove(deleteLoc.start.index, deleteLoc.end.index + (charAfter === ',' ? 1 : 0));
                            }

                            // Add preample
                            s.prependLeft(node.start!, meta.preamble);
                            if (insertedObj) {
                                s.appendRight(arg.start!, '}');
                            }

                            const filePath = stry(path.relative(ctx.environment.config.root, id));

                            s.appendRight(
                                node.end! - 1,
                                dedent`
                                static {
                                    this.__vType = ${helper('CLASS_COMPONENT')};
                                    this.__vInjectionId = Symbol(this.name);
                                    this.__vccOpts = {
                                        __file: ${filePath},
                                        __scopeId: ${stry('data-v-' + scopeId)},
                                        ${useHMR ? '__hmrId: ' + stry(scopeId) + ',' : ''}
                                        props: ${propsResult.inputs || '{}'},
                                        emits: ${propsResult.outputs || '[]'},
                                        setup: (_p, { expose }) => {
                                            const instance = ${helper('wrapClassComponent')}(new this());
                                            instance.__isScriptSetup = true;
                                            if ('onInit' in instance && typeof instance['onInit'] === 'function')
                                                ${helper('onMounted')}(() => instance.onInit());
                                            if ('onDestroy' in instance && typeof instance['onDestroy'] === 'function')
                                                ${helper('onBeforeUnmount')}(() => instance.onDestroy());
                            
                                            expose(instance);
                                            return instance;
                                        },
                                        render: __render_${scopeId}
                                    };
                                }
                                `
                            );

                            if (useHMR) {
                                // Append HMR
                                s.appendRight(
                                    node.end!,
                                    dedent`
                                \ntypeof __VUE_HMR_RUNTIME__ !== 'undefined' &&
                                    __VUE_HMR_RUNTIME__.createRecord(${stry(scopeId)}, ${meta.className})

                                import.meta.hot.on('file-changed', ({ file }) => {
                                    __VUE_HMR_RUNTIME__.CHANGED_FILE = file
                                });
                                import.meta.hot.accept(mod => {
                                    if (!mod) return;
                                    const { ${meta.className}: updated } = mod;
                                    __VUE_HMR_RUNTIME__.reload(${stry(scopeId)}, updated);
                                })
                                `
                                );
                            }
                        }
                    }
                }
            });
            if (importedHelpers.size) {
                s.appendRight(0, `import { `);
                const importString = Array.from(importedHelpers.entries())
                    .map(([helper, localVal]) => {
                        // Any cause it's not going to be used anyway
                        imports[localVal] = {} as any;

                        return `${helper} as ${localVal}`;
                    })
                    .join(', ');
                s.appendRight(0, importString);
                s.appendRight(0, ` } from '@prang/core/runtime';\n`);
            }

            if (s.hasChanged()) {
                return {
                    code: s.toString(),
                    map: s.generateMap()
                };
            }
        }
    };
}

export async function getComponentMeta(
    decoratorArg: ObjectExpression,
    classNode: ClassDeclaration,
    id: string,
    scopeHash: string,
    imports: Record<string, ImportBinding>,
    ctx: PluginContext
) {
    const className = classNode.id ? resolveIdentifier(classNode.id)[0] : undefined;
    if (!className) {
        ctx.error({
            loc: classNode.body.loc!.start,
            id,
            message: 'Component requires class to have a name'
        });
    }
    const meta: ComponentMeta = {
        deleteLocs: [],
        preamble: '',
        sourceId: id,
        className,
        bindings: {}
    };

    for await (const prop of decoratorArg.properties) {
        if (!isObjectProperty(prop) || !isIdentifier(prop.key)) continue;

        switch (prop.key.name) {
            case 'selector': {
                if (!isLiteralType(prop.value)) break;
                meta.selectors ||= [];
                meta.selectors.push(resolveString(prop.value));
                break;
            }
            case 'templateUrl': {
                if (!isLiteralType(prop.value)) break;
                const tmplUrl = resolveString(prop.value);
                let resolvedId = (await ctx.resolve(tmplUrl, id))?.id;
                if (!resolvedId) break;
                let importExp = resolvedId + `?prang&type=template&scopeId=${scopeHash}`;
                importExp = `import { render as __render_${scopeHash} } from ${stry(importExp)};\n`;

                meta.preamble += importExp;
                meta.template = { loc: prop.loc!, source: resolvedId };
                meta.deleteLocs.push(prop.loc!);
                break;
            }
            case 'template': {
                if (!isLiteralType(prop.value)) break;
                const templateString = resolveString(prop.value);

                if (!templateString) break;
                let tmplUrl = `${id}?prang&type=inline-template&scopeId=${scopeHash}`;
                tmplUrl = `import { render as __render_${scopeHash} } from ${stry(tmplUrl)};\n`;

                meta.preamble += tmplUrl;
                meta.template = { loc: prop.loc!, source: templateString };
                meta.inlineTemplate = true;
                meta.deleteLocs.push(prop.loc!);
                break;
            }

            case 'imports': {
                if (!isArrayExpression(prop.value)) break;
                const referencedIdentifiers = prop.value.elements.filter((v) => v?.type === 'Identifier');
                const identifiers = referencedIdentifiers.flatMap((i) => resolveIdentifier(i));

                meta.imports = await Promise.all(
                    Object.values(imports)
                        .filter((imp) => identifiers?.includes(imp.local))
                        .map(async (im) => {
                            const resolved = await ctx?.resolve(im.source, id);
                            im.source = resolved?.id ?? im.source;
                            if (resolved) {
                                // Load imports
                                await ctx?.load({ ...resolved, resolveDependencies: true });
                            }
                            return im;
                        })
                );
                break;
            }

            case 'styleUrls': {
                if (!isArrayExpression(prop.value)) break;
                const urls = prop.value.elements
                    .filter((v) => isLiteral(v))
                    .map((v) => (isTemplateLiteral(v) ? resolveTemplateLiteral(v) : resolveLiteral(v)?.toString()))
                    .filter((v) => v !== undefined);

                meta.styles ||= [];
                await Promise.all(
                    urls.map(async (url) => {
                        // ctx would be undefined in HMR, but styles are already hot replaced
                        const resolved = await ctx?.resolve(url, id);
                        if (resolved) {
                            let newUrl = resolved.id + `?prang&type=style&scopeId=${scopeHash}`;
                            newUrl = `import ${stry(newUrl)};\n`;
                            meta.styles!.push({ loc: prop.loc!, code: url });
                            meta.preamble += newUrl;
                        }
                    })
                );
                meta.deleteLocs!.push(prop.loc!);
                break;
            }

            case 'styles': {
                if (!isArrayExpression(prop.value)) break;
                const styles = prop.value.elements
                    .filter((v) => isLiteral(v))
                    .map((v) => ({
                        code: (isTemplateLiteral(v) ? resolveTemplateLiteral(v) : resolveLiteral(v)?.toString()) ?? '',
                        loc: v.loc!
                    }));

                meta.styles ||= [];
                styles.forEach((style) => {
                    const index = meta.styles!.push(style);
                    let tmplUrl = `${id}?prang&type=inline-style&scopeId=${scopeHash}&styleIndex=${index - 1}&lang.css`;
                    tmplUrl = `import ${stry(tmplUrl)};\n`;
                    meta.preamble += tmplUrl;
                });
                meta.deleteLocs.push(prop.loc!);
                break;
            }

            default:
                break;
        }
    }
    return meta;
}

async function getModuleInfoFromCode(code: string, id: string, ctx: PluginContext) {
    const ast = babelParse(code, path.extname(id), {
        sourceType: 'module',
        cache: true,
        sourceFilename: id,
        errorRecovery: true,
        plugins: [
            'jsx',
            'typescript',
            ['decorators', { allowCallParenthesized: true, decoratorsBeforeExport: true }],
            'decoratorAutoAccessors',
            'exportDefaultFrom',
            'functionBind',
            'importAssertions'
        ]
    });

    let componentIdent: string = 'Component';

    let classDeclarationIndex = -1;

    const imports: Record<string, ImportBinding> = {};

    const curComponentMap: Record<string, ComponentMeta> = {};
    await walkASTAsync(ast, {
        enter: async (node, parent) => {
            switch (node.type) {
                case 'ImportDeclaration': {
                    walkImportDeclaration(imports, node);
                    break;
                }
                case 'ImportSpecifier': {
                    if (
                        isImportDeclaration(parent) &&
                        parent.source.value === '@prang/core' &&
                        isIdentifierOf(node.imported, 'Component')
                    ) {
                        componentIdent = node.local.name;
                    }
                    break;
                }
                case 'ClassDeclaration': {
                    classDeclarationIndex++;
                    if (!node.decorators || node.decorators.length == 0) return;
                    for await (const decorator of node.decorators) {
                        if (
                            !isCallExpression(decorator.expression) ||
                            !isIdentifierOf(decorator.expression.callee, componentIdent)
                        )
                            continue;

                        const scopeHash = getHash(id + '#' + classDeclarationIndex);

                        let decArg: ObjectExpression | undefined = isObjectExpression(decorator.expression.arguments[0])
                            ? decorator.expression.arguments[0]
                            : undefined;

                        if (!decArg) {
                            decArg = objectExpression([]);
                            decArg.start = decorator.expression.end! - 1;
                        }
                        const meta = await getComponentMeta(decArg, node, id, scopeHash, imports, ctx);
                        meta.bindings = resolveBindings(node, imports);

                        if (meta) {
                            curComponentMap[scopeHash] = meta;
                        }
                    }
                }
            }
        }
    });
    return curComponentMap;
}

interface ModelDefinition {
    name: string;
    default?: {
        start: number;
        end: number;
    };
    options?: {
        start: number;
        end: number;
    };
}
function resolveProps(
    node: ClassDeclaration,
    s: MagicString,
    imports: Record<string, ImportBinding>,
    helper: (helper: string) => string
) {
    const importValues = Object.values(imports);
    const inputIdentifier = importValues.find((imp) => imp.source == '@prang/core' && imp.imported == 'input')?.local;
    const outputIdentifier = importValues.find((imp) => imp.source == '@prang/core' && imp.imported == 'output')?.local;
    const modelIdentifier = importValues.find((imp) => imp.source == '@prang/core' && imp.imported == 'model')?.local;

    const inputs = new Set<Expression>();
    const outputs = new Set<ClassProperty>();
    const models = new Set<ModelDefinition>();

    for (const property of node.body.body) {
        if (
            !isClassProperty(property) ||
            ![undefined, null, 'public'].includes(property.accessibility) ||
            property.static
        )
            continue;
        // Input
        if (
            inputIdentifier &&
            isCallExpression(property.value) &&
            isIdentifierOf(property.value.callee, inputIdentifier)
        ) {
            const localVal = helper('compiledInput');
            s.overwrite(property.value.callee.start!, property.value.callee.end!, localVal);
            s.appendRight(
                (property.value.typeParameters || property.value.callee).end! + 1,
                stry(toKeyAlias(property)) + (property.value.arguments.length ? ', ' : '')
            );
            inputs.add(property.key);
        }
        // Model
        if (
            modelIdentifier &&
            isCallExpression(property.value) &&
            isIdentifierOf(property.value.callee, modelIdentifier)
        ) {
            const localVal = helper('compiledModel');
            s.overwrite(property.value.callee.start!, property.value.callee.end!, localVal);
            s.appendRight(
                (property.value.typeParameters || property.value.callee).end! + 1,
                stry(toKeyAlias(property)) + (property.value.arguments.length ? ', ' : '')
            );
            const arg1 = property.value.arguments[0];
            const arg2 = property.value.arguments[1];
            models.add({
                name: camelize(s.original.slice(property.key.start!, property.key.end!)),
                default: arg1 ? { start: arg1.start!, end: arg1.end! } : undefined,
                options: arg2 ? { start: arg2.start!, end: arg2.end! } : undefined
            });
        }
        // Output
        if (
            outputIdentifier &&
            isCallExpression(property.value) &&
            isIdentifierOf(property.value.callee, outputIdentifier)
        ) {
            const localVal = helper('compiledOutput');
            s.overwrite(property.value.callee.start!, property.value.callee.end!, localVal);
            s.appendRight(
                (property.value.typeParameters || property.value.callee).end! + 1,
                stry(toKeyAlias(property)) + (property.value.arguments.length ? ', ' : '')
            );
            outputs.add(property);
        }
    }

    const results = {
        inputs: '',
        outputs: ''
    };
    if (inputs.size || models.size) {
        results.inputs += '{ ';
        for (const input of inputs) {
            results.inputs += `${s.original.slice(input.start!, input.end!)}: {}, `;
        }
        for (const model of models) {
            results.inputs += stry(model.name) + ': {}, ';
            results.inputs += `${stry(model.name + 'Modifiers')}: {}, `;
        }
        results.inputs += '}';
    }

    if (outputs.size || models.size) {
        results.outputs += `[`;
        for (const output of outputs) {
            results.outputs += `${stry(toKeyAlias(output))}, `;
        }
        for (const model of models) {
            results.outputs += `${stry('update:' + model.name)}, `;
        }
        results.outputs += `]`;
    }
    return results;
}

function resolveBindings(classNode: ClassDeclaration, imports: Record<string, ImportBinding>) {
    const getImportBinding = (name: string) => {
        return Object.values(imports).find((imp) => imp.source == '@prang/core' && imp.imported == name)?.local;
    };
    const input = getImportBinding('input');
    const model = getImportBinding('model');
    const signal = getImportBinding('signal');
    const viewChild = getImportBinding('viewChild');
    const computed = getImportBinding('computed');
    const signalProps = [input, model, signal, viewChild, computed].filter((v) => v !== undefined);

    const bindings: BindingMetadata = {};
    walkAST(classNode, {
        enter(node, parent) {
            if (
                isClassMethod(node) &&
                parent === classNode.body &&
                node.accessibility !== 'private' &&
                (isIdentifier(node.key) || isLiteral(node.key))
            ) {
                const name = resolveString(node.key);
                if (name === 'constructor') return;

                bindings[name] = BindingTypes.SETUP_CONST;
            } else if (
                isClassProperty(node) &&
                parent === classNode.body &&
                node.accessibility !== 'private' &&
                (isIdentifier(node.key) || isLiteral(node.key))
            ) {
                const name = resolveString(node.key);
                if (isCallOf(node.value, signalProps)) {
                    bindings[name] = BindingTypes.SETUP_SIGNAL;
                } else {
                    bindings[name] = BindingTypes.SETUP_CONST;
                }
            }
        }
    });
    return bindings;
}
