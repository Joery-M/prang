import { parse } from '@babel/parser';
import {
    isArrayExpression,
    isCallExpression,
    isIdentifier,
    isImportDeclaration,
    isObjectExpression,
    isObjectProperty,
    type ClassDeclaration,
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
                if (isObjectProperty(firstProp)) {
                    s.prependRight(
                        firstProp.start!,
                        `fileUrl: ${JSON.stringify(path.relative(this.environment.config.root, id))},\n`
                    );
                }

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

                                for (const arg of decorator.expression.arguments) {
                                    if (!isObjectExpression(arg)) continue;
                                    const newMeta = await getComponentMeta(arg, node, id, scopeHash);
                                    if (newMeta) {
                                        meta = {
                                            ...newMeta,
                                            sourceId: id,
                                            className: node.id ? resolveIdentifier(node.id)[0] : undefined,
                                            span: { start: node.start!, end: node.end! }
                                        };
                                    }
                                }

                                if (meta) {
                                    ComponentMap.set(scopeHash, meta);
                                }
                            }
                        }
                    }
                }
            });

            return {
                code: s.toString(),
                map: s.generateMap()
            };
        },
        buildStart() {
            ComponentMap.clear();
        }
    };
}
