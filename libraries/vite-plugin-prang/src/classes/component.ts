import {
    isArrayExpression,
    isCallExpression,
    isClassMethod,
    isClassProperty,
    isIdentifier,
    isLiteral,
    isObjectExpression,
    isObjectProperty,
    isTemplateLiteral,
    objectExpression,
    toKeyAlias,
    type ClassDeclaration,
    type ObjectExpression
} from '@babel/types';
import { BindingTypes, type BindingMetadata } from '@vue/compiler-core';
import { camelize } from '@vue/shared';
import {
    babelParse,
    isCallOf,
    isIdentifierOf,
    isLiteralType,
    resolveIdentifier,
    resolveLiteral,
    resolveString,
    resolveTemplateLiteral,
    walkAST,
    walkImportDeclaration,
    type ImportBinding
} from 'ast-kit';
import { existsSync, readFileSync } from 'fs';
import MagicString from 'magic-string';
import path from 'pathe';
import type { PluginContext, TransformResult } from 'rollup';
import { ClassMetaMap, ClassType, type ComponentImportBinding, type ComponentMeta, type PipeMeta } from '../internal';
import { compileTemplate } from '../template/template';
import { dedent, getHash, stry } from '../utils';

export async function componentTransform(code: string, id: string, useHMR: boolean): Promise<TransformResult> {
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
    let classDeclarationIndex = -1;

    const importedHelpers = new Map<string, string>();
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
                    const meta = ClassMetaMap.get(scopeId);
                    const decorator = node.decorators?.[0];
                    if (
                        !meta ||
                        meta.type !== ClassType.COMPONENT ||
                        !decorator ||
                        !isCallExpression(decorator.expression)
                    )
                        break;
                    const helper = (helper: string) => {
                        const localVal = '_' + helper;
                        importedHelpers.set(helper, localVal);
                        return localVal;
                    };

                    let arg: ObjectExpression | undefined = isObjectExpression(decorator.expression.arguments[0])
                        ? decorator.expression.arguments[0]
                        : undefined;

                    let insertedObj = false;
                    if (!arg) {
                        s.prependLeft(decorator.expression.end! - 1, '{\n');
                        arg = objectExpression([]);
                        arg.start = decorator.expression.end! - 1;
                        insertedObj = true;
                    }

                    // Add preample
                    s.prependLeft(node.start!, meta.preamble);
                    if (insertedObj) {
                        s.appendRight(arg.start!, '}');
                    }

                    // Remove decorator
                    s.remove(decorator.start!, decorator.end!);

                    generateStaticFields(node, s, meta, scopeId, id, useHMR, helper, imports);
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
        s.appendRight(0, ` } from 'prang/runtime';\n`);
    }

    if (s.hasChanged()) {
        return {
            code: s.toString(),
            map: s.generateMap()
        };
    }
}

function generateStaticFields(
    node: ClassDeclaration,
    s: MagicString,
    meta: ComponentMeta,
    scopeId: string,
    filePath: string,
    useHMR: boolean,
    helper: (key: string) => string,
    imports: Record<string, ImportBinding>
) {
    meta.imports ||= [];
    const formatBinding = (str1: string, str2: string) => stry(str1) + ': ' + str2;

    const componentArray = meta.imports
        .filter((imp) => imp.type === ClassType.COMPONENT)
        .map((imp) => {
            if (imp.scopeId) {
                const meta = ClassMetaMap.get(imp.scopeId) as ComponentMeta;
                if (meta.selectors) {
                    return meta.selectors.map((s) => formatBinding(s, imp.local));
                } else {
                    return formatBinding(meta.className, imp.local);
                }
            }
            return imp.local;
        })
        .flat()
        .join(', ');
    const pipeArray = meta.imports
        .filter((imp) => imp.type === ClassType.PIPE)
        .map((imp) => {
            if (imp.scopeId) {
                const meta = ClassMetaMap.get(imp.scopeId) as PipeMeta;
                if (meta.name) return formatBinding(meta.name, imp.local);
            }
            return imp.local;
        })
        .join(', ');
    const propsResult = resolveProps(node, s, imports, helper);
    if (process.env.NODE_ENV === 'production') {
        let templateCode = meta.template?.source ?? '';
        let filename = (meta.inlineTemplate ? filePath : meta.template?.source) ?? filePath;
        if (!meta.inlineTemplate && meta.template && existsSync(meta.template.source)) {
            templateCode = readFileSync(meta.template.source).toString();
        }
        const template = compileTemplate(
            templateCode,
            { request: { filename, query: { scopeId } }, meta },
            true,
            false
        );
        s.prependLeft(node.start!, template.preamble);
        s.appendRight(
            node.end! - 1,
            dedent`
            static {
                this.__vType = ${helper('CLASS_COMPONENT')};
                this.__vInjectionId = Symbol(this.name);
                this.__vSelector = ${stry(meta.className)};
                this.__vccOpts = {
                    __scopeId: ${stry('data-v-' + scopeId)},
                    __name: ${stry(meta.className)},
                    ${propsResult.inputs ? 'props: ' + propsResult.inputs + ',' : ''}
                    ${propsResult.outputs ? 'emits: ' + propsResult.outputs + ',' : ''}
                    components: {${componentArray}},
                    filters: {${pipeArray}},
                    setup: (_p, { expose }) => {
                        const $setup = ${helper('wrapClassComponent')}(new this());
                        $setup.__isScriptSetup = true;
                        if ('onInit' in $setup && typeof $setup['onInit'] === 'function')
                            ${helper('onMounted')}(() => $setup.onInit());
                        if ('onDestroy' in $setup && typeof $setup['onDestroy'] === 'function')
                            ${helper('onBeforeUnmount')}(() => $setup.onDestroy());
        
                        expose($setup);
                        return ${template.code};
                    }
                };
            }
        `
        );
    } else {
        s.appendRight(
            node.end! - 1,
            dedent`
            static {
                this.__vType = ${helper('CLASS_COMPONENT')};
                this.__vInjectionId = Symbol(this.name);
                this.__vSelector = ${stry(meta.className)};
                this.__vccOpts = {
                    __name: ${stry(meta.className)},
                    __file: ${stry(filePath)},
                    __scopeId: ${stry('data-v-' + scopeId)},
                    ${useHMR ? '__hmrId: ' + stry(scopeId) + ',' : ''}
                    ${propsResult.inputs ? 'props: ' + propsResult.inputs + ',' : ''}
                    ${propsResult.outputs ? 'emits: ' + propsResult.outputs + ',' : ''}
                    components: {${componentArray}},
                    filters: {${pipeArray}},
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
                    \n__VUE_HMR_RUNTIME__?.createRecord(${stry(scopeId)}, ${meta.className})

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

async function resolveComponentImports(
    meta: ComponentMeta,
    imports: ImportBinding[],
    identifiers: string[],
    ctx: PluginContext
) {
    const resolvePromises = imports
        .filter((imp) => identifiers.includes(imp.local))
        .map(async (im) => {
            const resolved = await ctx.resolve(im.source, meta.sourceId);
            im.source = resolved?.id ?? im.source;
            let type: ClassType = ClassType.UNKNOWN;
            let scopeId: string | undefined;
            if (resolved) {
                if (!ctx.getModuleInfo(resolved.id)) {
                    // First time, scan file
                    await ctx?.load({ ...resolved, resolveDependencies: true });
                }
                const foundComponent = Array.from(ClassMetaMap.entries()).find(
                    (meta) => meta[1].sourceId === resolved.id
                );
                if (foundComponent) {
                    type = foundComponent[1].type;
                    scopeId = foundComponent[0];
                } else {
                    console.log('Not found:', im.source);
                }
            }
            return { ...im, type, scopeId } satisfies ComponentImportBinding;
        });

    return await Promise.all(resolvePromises);
}

export async function getComponentMeta(
    decoratorArg: ObjectExpression,
    classNode: ClassDeclaration,
    id: string,
    scopeHash: string,
    imports: Record<string, ImportBinding>,
    ctx: PluginContext
): Promise<ComponentMeta> {
    const className = classNode.id ? resolveIdentifier(classNode.id)[0] : undefined;
    if (!className) {
        ctx.error({
            loc: classNode.body.loc!.start,
            id,
            message: '@Component requires class to have a name'
        });
    }
    const meta: ComponentMeta = {
        type: ClassType.COMPONENT,
        preamble: '',
        sourceId: id,
        className,
        bindings: resolveBindings(classNode, imports)
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

                if (process.env.NODE_ENV !== 'production') {
                    let importExp = resolvedId + `?prang&type=template&scopeId=${scopeHash}`;
                    importExp = `import { render as __render_${scopeHash} } from ${stry(importExp)};\n`;
                    meta.preamble += importExp;
                }
                meta.template = { loc: prop.loc!, source: resolvedId };
                break;
            }
            case 'template': {
                if (!isLiteralType(prop.value)) break;
                const templateString = resolveString(prop.value);

                if (!templateString) break;

                if (process.env.NODE_ENV !== 'production') {
                    let tmplUrl = `${id}?prang&type=inline-template&scopeId=${scopeHash}`;
                    tmplUrl = `import { render as __render_${scopeHash} } from ${stry(tmplUrl)};\n`;
                    meta.preamble += tmplUrl;
                }
                meta.template = { loc: prop.loc!, source: templateString };
                meta.inlineTemplate = true;
                break;
            }

            case 'imports': {
                if (!isArrayExpression(prop.value)) break;
                const referencedIdentifiers = prop.value.elements.filter((v) => v?.type === 'Identifier');
                const identifiers = referencedIdentifiers.flatMap((i) => resolveIdentifier(i));

                const compImports = await resolveComponentImports(meta, Object.values(imports), identifiers, ctx);
                meta.imports = compImports;
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
                        const resolved = await ctx.resolve(url, id);
                        if (resolved) {
                            const index = meta.styles!.push({ loc: prop.loc!, code: url });
                            let newUrl = resolved.id + `?prang&type=style&scopeId=${scopeHash}&styleIndex=${index - 1}`;
                            newUrl = `import ${stry(newUrl)};\n`;
                            meta.preamble += newUrl;
                        }
                    })
                );
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
                break;
            }

            default:
                break;
        }
    }
    return meta;
}

/**
 * Convert inputs, outputs and models into compiled versions
 *
 * @example
 * value = input(...)   >  value = _compiledInput("value", ...)
 * model = model(...)   >  model = _compiledModel("model", ...)
 * event = output(...)  >  event = _compiledOutput("event", ...)
 *
 * @returns Formatted decorator arguments for `props` and `emits`.
 */
function resolveProps(
    node: ClassDeclaration,
    s: MagicString,
    imports: Record<string, ImportBinding>,
    helper: (helper: string) => string
) {
    const importValues = Object.values(imports);
    const inputIdentifier = importValues.find((imp) => imp.source == 'prang' && imp.imported == 'input')?.local;
    const outputIdentifier = importValues.find((imp) => imp.source == 'prang' && imp.imported == 'output')?.local;
    const modelIdentifier = importValues.find((imp) => imp.source == 'prang' && imp.imported == 'model')?.local;

    const inputs = new Set<string>();
    const outputs = new Set<string>();
    const models = new Set<string>();

    for (const property of node.body.body) {
        if (
            !isClassProperty(property) ||
            ![undefined, null, 'public', 'protected'].includes(property.accessibility) ||
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
            inputs.add(toKeyAlias(property));
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
            models.add(camelize(s.original.slice(property.key.start!, property.key.end!)));
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
            outputs.add(toKeyAlias(property));
        }
    }

    const results = {
        inputs: '',
        outputs: ''
    };
    if (inputs.size || models.size) {
        results.inputs += '{ ';
        for (const input of inputs) {
            results.inputs += `${stry(input)}: {}, `;
        }
        for (const model of models) {
            results.inputs += stry(model) + ': {}, ';
            results.inputs += `${stry(model + 'Modifiers')}: {}, `;
        }
        results.inputs += '}';
    }

    if (outputs.size || models.size) {
        results.outputs += `[`;
        for (const output of outputs) {
            results.outputs += `${stry(output)}, `;
        }
        for (const model of models) {
            results.outputs += `${stry('update:' + model)}, `;
        }
        results.outputs += `]`;
    }
    return results;
}

/**
 * Resolve metadata bindings used in the component model
 *
 * @see {@linkcode compileTemplate|template.ts@compileTemplate}
 */
function resolveBindings(classNode: ClassDeclaration, imports: Record<string, ImportBinding>) {
    const getImportBinding = (name: string) => {
        return Object.values(imports).find((imp) => imp.source == 'prang' && imp.imported == name)?.local;
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
