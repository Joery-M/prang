import {
    isArrayExpression,
    isCallExpression,
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
import { camelize } from '@vue/shared';
import {
    babelParse,
    isIdentifierOf,
    isLiteralType,
    parseCache,
    resolveIdentifier,
    resolveLiteral,
    resolveString,
    resolveTemplateLiteral,
    walkASTAsync,
    walkImportDeclaration,
    type ImportBinding
} from 'ast-kit';
import { readFile } from 'fs/promises';
import MagicString from 'magic-string';
import path from 'pathe';
import type { PluginContext } from 'rollup';
import type { Plugin } from 'vite';
import { ComponentMap, type ComponentMeta } from '../internal';
import { getHash } from '../utils';

export function ComponentScanPlugin(): Plugin {
    parseCache.clear();

    return {
        name: 'prang:component-scan',
        enforce: 'pre',
        cacheKey: 'prang:component-scan',
        async load(id) {
            if (id.includes('\0') || id.includes('/node_modules/') || id.includes('?prang') || !/\.[tj]sx?$/.test(id))
                return;
            await getModuleInfoFromID(id, this);
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
            let classDeclarationIndex = -1;

            await walkASTAsync(ast, {
                enter: async (node) => {
                    switch (node.type) {
                        case 'ImportDeclaration': {
                            walkImportDeclaration(imports, node);
                            break;
                        }
                        case 'ClassDeclaration': {
                            classDeclarationIndex++;

                            const scopeHash = getHash(id + '#' + classDeclarationIndex);
                            const meta = ComponentMap.get(scopeHash);
                            const decorator = node.decorators?.[0];
                            if (!meta || !decorator || !isCallExpression(decorator.expression)) break;

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
                            resolveProps(arg, node, s, imports);

                            const insertScopeId = !!meta.styles?.length;
                            if (insertScopeId) {
                                const firstProp = arg.properties[0];
                                const decPropsStart = isObjectProperty(firstProp) ? firstProp.start! : arg.start!;
                                s.appendRight(
                                    decPropsStart,
                                    `fileUrl: ${JSON.stringify(path.relative(this.environment.config.root, id))},\n\t` +
                                        (insertScopeId ? `scopeId: ${JSON.stringify(scopeHash)},\n\t` : '')
                                );
                            }

                            for (const deleteLoc of meta.deleteLocs) {
                                s.remove(deleteLoc.start.index, deleteLoc.end.index);
                            }

                            // Add preample
                            s.prependLeft(node.start!, meta.preamble);

                            // Add render fn
                            if (meta.template) {
                                s.update(
                                    meta.template.loc.start.index,
                                    meta.template.loc.end.index,
                                    `render: __render_${scopeHash}`
                                );
                            }
                            if (insertedObj) {
                                s.appendRight(arg.start!, '}');
                            }
                        }
                    }
                }
            });

            if (s.hasChanged()) {
                return {
                    code: s.toString(),
                    map: s.generateMap()
                };
            }
        }
    };
}

async function getComponentMeta(
    decoratorArg: ObjectExpression,
    classNode: ClassDeclaration,
    id: string,
    scopeHash: string,
    ctx: PluginContext,
    imports: Record<string, ImportBinding>
): Promise<Partial<ComponentMeta>> {
    const meta: Partial<ComponentMeta> & Pick<ComponentMeta, 'deleteLocs' | 'preamble'> = {
        deleteLocs: [],
        preamble: ''
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
                importExp = `import { render as __render_${scopeHash} } from ${JSON.stringify(importExp)};\n`;

                meta.preamble += importExp;
                meta.template = { loc: prop.loc!, source: resolvedId };
                break;
            }
            case 'template': {
                if (!isLiteralType(prop.value)) break;
                const templateString = resolveString(prop.value);

                if (!templateString) break;
                let tmplUrl = `${id}?prang&type=inline-template&scopeId=${scopeHash}`;
                tmplUrl = `import { render as __render_${scopeHash} } from ${JSON.stringify(tmplUrl)};\n`;

                meta.preamble += tmplUrl;
                meta.template = { loc: prop.loc!, source: templateString };
                meta.inlineTemplate = true;
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
                            const resolved = await ctx.resolve(im.source, id);
                            im.source = resolved?.id ?? im.source;
                            if (resolved) {
                                // Load imports
                                await ctx.load({ ...resolved, resolveDependencies: true });
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
                        const resolved = await ctx.resolve(url, id);
                        if (resolved) {
                            let newUrl = resolved.id + `?prang&type=style&scopeId=${scopeHash}`;
                            newUrl = `import ${JSON.stringify(newUrl)};\n`;
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
                    tmplUrl = `import ${JSON.stringify(tmplUrl)};\n`;
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

async function getModuleInfoFromID(rawId: string, ctx: PluginContext) {
    const id = path.resolve(rawId);

    const code = (await readFile(id)).toString();
    if (!code.includes('@prang/core') || !code.includes('class')) {
        return;
    }

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

                        let meta: ComponentMeta | undefined;
                        const scopeHash = getHash(id + '#' + classDeclarationIndex);

                        let arg: ObjectExpression | undefined = isObjectExpression(decorator.expression.arguments[0])
                            ? decorator.expression.arguments[0]
                            : undefined;

                        if (!arg) {
                            arg = objectExpression([]);
                            arg.start = decorator.expression.end! - 1;
                        }
                        const newMeta = await getComponentMeta(arg, node, id, scopeHash, ctx, imports);
                        if (newMeta) {
                            meta = {
                                preamble: '',
                                deleteLocs: [],
                                ...newMeta,
                                sourceId: id,
                                className: node.id ? resolveIdentifier(node.id)[0] : undefined,
                                span: { start: node.start!, end: node.end! }
                            };
                        }

                        if (meta) {
                            ComponentMap.set(scopeHash, meta);
                        }
                    }
                }
            }
        }
    });
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
    decoratorArg: ObjectExpression,
    node: ClassDeclaration,
    s: MagicString,
    imports: Record<string, ImportBinding>
) {
    const importValues = Object.values(imports);
    const inputIdentifier = importValues.find((imp) => imp.source == '@prang/core' && imp.imported == 'input')?.local;
    const outputIdentifier = importValues.find((imp) => imp.source == '@prang/core' && imp.imported == 'output')?.local;
    const modelIdentifier = importValues.find((imp) => imp.source == '@prang/core' && imp.imported == 'model')?.local;

    const firstProp = decoratorArg.properties[0];
    const decPropsStart = isObjectProperty(firstProp) ? firstProp.start! : decoratorArg.start!;

    const inputs = new Set<Expression>();
    const outputs = new Set<ClassProperty>();
    const models = new Set<ModelDefinition>();

    const importedHelpers = new Map<string, string>();
    const importHelper = (helper: string) => {
        const localVal = '_' + helper;
        importedHelpers.set(helper, localVal);
        return localVal;
    };

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
            const localVal = importHelper('compiledInput');
            s.overwrite(property.value.callee.start!, property.value.callee.end!, localVal);
            s.appendRight(
                (property.value.typeParameters || property.value.callee).end! + 1,
                JSON.stringify(toKeyAlias(property)) + (property.value.arguments.length ? ', ' : '')
            );
            inputs.add(property.key);
        }
        // Model
        if (
            modelIdentifier &&
            isCallExpression(property.value) &&
            isIdentifierOf(property.value.callee, modelIdentifier)
        ) {
            const localVal = importHelper('compiledModel');
            s.overwrite(property.value.callee.start!, property.value.callee.end!, localVal);
            s.appendRight(
                (property.value.typeParameters || property.value.callee).end! + 1,
                JSON.stringify(toKeyAlias(property)) + (property.value.arguments.length ? ', ' : '')
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
            const localVal = importHelper('compiledOutput');
            s.overwrite(property.value.callee.start!, property.value.callee.end!, localVal);
            s.appendRight(
                (property.value.typeParameters || property.value.callee).end! + 1,
                JSON.stringify(toKeyAlias(property)) + (property.value.arguments.length ? ', ' : '')
            );
            outputs.add(property);
        }
    }

    if (inputs.size || models.size) {
        s.appendRight(decPropsStart, `inputs: {\n\t`);
        for (const input of inputs) {
            s.appendRight(decPropsStart, '\t' + s.original.slice(input.start!, input.end!) + ': {},\n\t');
        }
        for (const model of models) {
            s.appendRight(decPropsStart, '\t' + JSON.stringify(model.name) + ': {},\n\t');
            s.appendRight(decPropsStart, '\t' + JSON.stringify(model.name + 'Modifiers') + ': {},\n\t');
        }
        s.appendRight(decPropsStart, `},\n\t`);
    }

    if (outputs.size || models.size) {
        s.appendRight(decPropsStart, `outputs: [\n\t`);
        for (const output of outputs) {
            s.appendRight(decPropsStart, '\t' + JSON.stringify(toKeyAlias(output)) + '\n\t');
        }
        for (const model of models) {
            s.appendRight(decPropsStart, '\t' + JSON.stringify('update:' + model.name) + '\n\t');
        }
        s.appendRight(decPropsStart, `],\n\t`);
    }

    if (importedHelpers.size) {
        s.appendRight(0, `import { `);
        for (const [helper, localVal] of importedHelpers) {
            s.appendRight(0, `${helper} as ${localVal}, `);
            // Not going to be used anyway
            imports[localVal] = {} as any;
        }
        s.appendRight(0, ` } from '@prang/core/runtime';\n`);
    }
}
