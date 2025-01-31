import { parse } from '@babel/parser';
import { type ClassDeclaration } from '@babel/types';
import { resolveIdentifier, walkAST, walkImportDeclaration, type ImportBinding } from 'ast-kit';
import dedent from 'dedent';
import MagicString from 'magic-string';
import { type Plugin } from 'vite';
import { ComponentMap, type ComponentMeta } from '../../internal';
import { getHash, parseTemplateRequest } from '../../utils';
import { relative } from 'node:path';

export function ComponentTransformPlugin(): Plugin {
    return {
        name: 'prang:component-transform',

        resolveId(id) {
            const req = parseTemplateRequest(id);
            if (req?.query.prang && !req.query.inline) {
                return id;
            }
        },
        async transform(code, id) {
            if (id.includes('/node_modules/') || !code.includes('class')) return;

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
            let classDeclarationIndex = -1;

            const imports: Record<string, ImportBinding> = {};

            const resolveTemplate = (compMeta: ComponentMeta, node: ClassDeclaration, scopeHash: string) => {
                if (!compMeta.template) return;
                const body = node.body;
                let templateUrl = '';

                if (compMeta.inlineTemplate) {
                    templateUrl = `${compMeta.sourceId}?prang=true&scopeId=${scopeHash}&inline=true`;
                } else {
                    templateUrl = `${compMeta.template}?prang=true&scopeId=${scopeHash}`;
                }
                s.prepend(
                    `import { render as __render_${classDeclarationIndex} } from ${JSON.stringify(templateUrl)};\n`
                );

                const componentName = compMeta.selector
                    ? compMeta.selector
                    : node.id
                    ? resolveIdentifier(node.id)[0]
                    : this.getFileName(compMeta.sourceId);

                const allComponents = Array.from(ComponentMap.values());
                const importedComponents = (compMeta.imports ?? []).map((binding) => {
                    allComponents.find((comp) => {
                        binding.imported === comp.
                    })
                });
                s.appendRight(
                    (body.end ?? 1) - 1,
                    dedent`\n
                        static __vccOpts = {
                            __name: ${JSON.stringify(componentName)},
                            __file: ${JSON.stringify(
                                relative(this.environment.config.root, compMeta.sourceId).replace(/\\/g, '/')
                            )},
                            components: {},
                            setup: (__props) => {
                                const instance = new this();
                                const wrapped = _wrapReactiveClass(instance)
                                return (ctx, cache) => __render_${classDeclarationIndex}(instance, cache, __props, wrapped);
                            },
                        };\n`
                );
                if (!('_defineComponent' in imports)) {
                    s.prepend(`import { defineComponent as _defineComponent } from '@prang/core/runtime';\n`);
                    imports['_defineComponent'] = {
                        imported: 'defineComponent',
                        isType: false,
                        local: '_defineComponent',
                        source: '@prang/core/runtime',
                        specifier: {} as any
                    };
                }
                if (!('_wrapReactiveClass' in imports)) {
                    s.prepend(`import { wrapReactiveClass as _wrapReactiveClass } from '@prang/core/runtime';\n`);
                    imports['_wrapReactiveClass'] = {
                        imported: 'wrapReactiveClass',
                        isType: false,
                        local: '_wrapReactiveClass',
                        source: '@prang/core/runtime',
                        specifier: {} as any
                    };
                }
            };

            walkAST(ast, {
                enter(node) {
                    if (node.type === 'ImportDeclaration') {
                        walkImportDeclaration(imports, node);
                    } else if (node.type === 'ClassDeclaration') {
                        classDeclarationIndex++;
                        const scopeHash = getHash(id + '#' + classDeclarationIndex);
                        const compMeta = ComponentMap.get(scopeHash);
                        if (compMeta) {
                            resolveTemplate(compMeta, node, scopeHash);
                        }
                    }
                }
            });

            return {
                code: s.toString(),
                map: s.generateMap()
            };
        }
    };
}
