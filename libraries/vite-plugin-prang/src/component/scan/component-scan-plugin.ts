import { parse } from '@babel/parser';
import {
    isArrayExpression,
    isCallExpression,
    isClassProperty,
    isIdentifier,
    isImportDeclaration,
    isObjectExpression,
    isObjectProperty,
    objectExpression,
    type ClassDeclaration,
    type Expression,
    type ObjectExpression
} from '@babel/types';
import {
    isIdentifierOf,
    isLiteralType,
    resolveIdentifier,
    resolveString,
    walkASTAsync,
    walkImportDeclaration,
    type ImportBinding
} from 'ast-kit';
import MagicString from 'magic-string';
import path from 'pathe';
import type { Plugin } from 'vite';
import { ComponentMap, type ComponentMeta } from '../../internal';
import { getHash } from '../../utils';

export function ComponentScanPlugin(): Plugin {
    return {
        name: 'prang:component-scan',
        enforce: 'pre',
        async transform(code, id) {
            if (
                id.includes('/node_modules/') ||
                id.includes('&inline') ||
                !code.includes('@prang/core') ||
                !code.includes('class')
            )
                return;

            const ast = parse(code, {
                sourceType: 'module',
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

            let componentIdent: string = 'Component';

            let classDeclarationIndex = -1;

            const imports: Record<string, ImportBinding> = {};

            const getComponentMeta = async (
                decoratorArg: ObjectExpression,
                classNode: ClassDeclaration,
                id: string,
                scopeHash: string
            ): Promise<Partial<ComponentMeta>> => {
                const meta: Partial<ComponentMeta> = {};

                // Add the file path before the first property
                const firstProp = decoratorArg.properties[0];
                s.appendRight(
                    isObjectProperty(firstProp) ? firstProp.start! : decoratorArg.start!,
                    `fileUrl: ${JSON.stringify(path.relative(this.environment.config.root, id))},\n\t`
                );

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
                            const resolvedId = (await this.resolve(tmplUrl, id))?.id;
                            if (!resolvedId) break;
                            s.prependLeft(
                                classNode.start!,
                                `import { render as __render_${scopeHash} } from ${JSON.stringify(
                                    resolvedId + `?prang&scopeId=${scopeHash}`
                                )};\n`
                            );
                            s.update(prop.key.start!, prop.key.end!, 'render');
                            s.update(prop.value.start!, prop.value.end!, `__render_${scopeHash}`);
                            meta.template = resolvedId;
                            break;
                        }
                        case 'template': {
                            if (!isLiteralType(prop.value)) break;
                            const templateString = resolveString(prop.value);

                            if (!templateString) break;
                            // Change extension to .html
                            const changedExt = path.join(
                                path.dirname(id),
                                path.basename(id, path.extname(id)) + '.html'
                            );

                            const tmplUrl = `${changedExt}?prang&scopeId=${scopeHash}&inline`;
                            s.prependLeft(
                                classNode.start!,
                                `import { render as __render_${scopeHash} } from ${JSON.stringify(tmplUrl)};\n`
                            );
                            s.update(prop.key.start!, prop.key.end!, 'render');
                            s.update(prop.value.start!, prop.value.end!, `__render_${scopeHash}`);
                            meta.template = templateString;
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
                                        const resolved = await this.resolve(im.source, id);
                                        im.source = resolved?.id ?? im.source;
                                        if (resolved) {
                                            // Load imports
                                            await this.load({ ...resolved, resolveDependencies: true });
                                        }
                                        return im;
                                    })
                            );
                            break;
                        }

                        default:
                            break;
                    }
                }
                return meta;
            };

            function resolveProps(decoratorArg: ObjectExpression, node: ClassDeclaration) {
                const inputIdentifier = Object.values(imports).find(
                    (imp) => imp.source == '@prang/core' && imp.imported == 'input'
                )?.local;
                const outputIdentifier = Object.values(imports).find(
                    (imp) => imp.source == '@prang/core' && imp.imported == 'output'
                )?.local;

                const firstProp = decoratorArg.properties[0];
                const decPropsStart = isObjectProperty(firstProp) ? firstProp.start! : decoratorArg.start!;

                const inputs = new Set<Expression>();
                const outputs = new Set<Expression>();

                for (const property of node.body.body) {
                    if (
                        !isClassProperty(property) ||
                        ![undefined, null, 'public'].includes(property.accessibility) ||
                        property.static
                    )
                        continue;
                    if (
                        inputIdentifier &&
                        isCallExpression(property.value) &&
                        isIdentifierOf(property.value.callee, inputIdentifier)
                    ) {
                        console.log('Input');
                        inputs.add(property.key);
                    }
                    if (
                        outputIdentifier &&
                        isCallExpression(property.value) &&
                        isIdentifierOf(property.value.callee, outputIdentifier)
                    ) {
                        console.log('Output');
                        outputs.add(property.key);
                    }
                }

                if (inputs.size) {
                    s.appendRight(decPropsStart, `inputs: {`);
                    for (const input of inputs) {
                        s.appendRight(decPropsStart, s.original.slice(input.start!, input.end!) + ': {}');
                    }
                    s.appendRight(decPropsStart, `},\n\t`);
                }
                if (outputs.size) {
                    s.appendRight(decPropsStart, `outputs: [`);
                    for (const output of outputs) {
                        s.appendRight(decPropsStart, JSON.stringify(s.original.slice(output.start!, output.end!)));
                    }
                    s.appendRight(decPropsStart, `],\n\t`);
                }
            }

            await walkASTAsync(ast.program, {
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
                                resolveProps(arg, node);
                                const newMeta = await getComponentMeta(arg, node, id, scopeHash);
                                if (newMeta) {
                                    meta = {
                                        ...newMeta,
                                        sourceId: id,
                                        className: node.id ? resolveIdentifier(node.id)[0] : undefined,
                                        span: { start: node.start!, end: node.end! }
                                    };
                                }
                                if (insertedObj) {
                                    s.appendRight(arg.start!, '}');
                                }

                                if (meta) {
                                    ComponentMap.set(scopeHash, meta);
                                }
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
        },
        buildStart() {
            ComponentMap.clear();
        }
    };
}
