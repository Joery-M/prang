import { parse } from '@babel/parser';
import { isArrayExpression, type ObjectExpression } from '@babel/types';
import {
    isLiteralType,
    resolveIdentifier,
    resolveString,
    walkASTAsync,
    walkImportDeclaration,
    type ImportBinding
} from 'ast-kit';
import MagicString from 'magic-string';
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
                id.includes('inline=true') ||
                !code.includes('@prang/core') ||
                !code.includes('class')
            )
                return;

            // const ast = parseSync(id, code);
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
                id: string,
                scopeHash: string
            ): Promise<Partial<ComponentMeta>> => {
                const meta: Partial<ComponentMeta> = {};
                for await (const prop of decoratorArg.properties) {
                    if (prop.type !== 'ObjectProperty' || prop.key.type !== 'Identifier') continue;

                    switch (prop.key.name) {
                        case 'selector': {
                            if (!isLiteralType(prop.value)) break;
                            meta.selector = resolveString(prop.value);
                            break;
                        }
                        case 'templateUrl': {
                            if (!isLiteralType(prop.value)) break;
                            const tmplUrl = resolveString(prop.value);
                            if (tmplUrl) {
                                const resolvedId = (await this.resolve(tmplUrl, id))?.id;
                                if (resolvedId) {
                                    meta.template = resolvedId;
                                }
                            }
                            break;
                        }
                        case 'template': {
                            if (!isLiteralType(prop.value)) break;
                            const templateString = resolveString(prop.value);

                            if (templateString) {
                                // Scope ID gets added later
                                meta.template = templateString;
                                meta.inlineTemplate = true;
                            }
                            break;
                        }

                        case 'imports': {
                            if (isArrayExpression(prop.value)) {
                                const referencedIdentifiers = prop.value.elements.filter(
                                    (v) => v?.type === 'Identifier'
                                );
                                const identifiers = referencedIdentifiers.flatMap((i) => resolveIdentifier(i));

                                meta.imports = await Promise.all(
                                    Object.values(imports)
                                        .filter((imp) => identifiers?.includes(imp.local))
                                        .map(async (im) => {
                                            im.source = (await this.resolve(im.source, id))?.id ?? im.source;
                                            return im;
                                        })
                                );
                            }
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
                                parent &&
                                parent.type === 'ImportDeclaration' &&
                                parent.source.value === '@prang/core' &&
                                node.imported.type === 'Identifier' &&
                                node.imported.name === 'Component'
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
                                    decorator.expression.type !== 'CallExpression' ||
                                    decorator.expression.callee.type !== 'Identifier' ||
                                    decorator.expression.callee.name !== componentIdent
                                )
                                    continue;
                                let meta: ComponentMeta | undefined;
                                const scopeHash = getHash(id + '#' + classDeclarationIndex);
                                for (const arg of decorator.expression.arguments) {
                                    if (arg.type !== 'ObjectExpression') continue;
                                    const newMeta = await getComponentMeta(arg, id, scopeHash);
                                    if (newMeta) {
                                        meta = {
                                            ...newMeta,
                                            sourceId: id,
                                            span: { start: node.start!, end: node.end! }
                                        };
                                    }
                                }

                                s.remove(decorator.start!, decorator.end!);

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
