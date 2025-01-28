import MagicString from 'magic-string';
import type { AstNode, RollupAstNode } from 'rollup';
import { parseAst, type Plugin } from 'vite';
import { walk } from 'zimmerframe';
import { ComponentMap, type ComponentMeta } from '../../internal';
import { getHash, parseTemplateRequest } from '../../utils';
import { doExpression, isClassMethod, type Class, type ClassDeclaration } from '@babel/types';
import { resolveObjectKey, walkAST } from 'ast-kit';
import { parse } from '@babel/parser';

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

            const promises: Promise<any>[] = [];

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

                const constructor = body.body.find((b) => b.type === 'ClassMethod' && b.kind === 'constructor');

                const methods = body.body.filter((prop) => isClassMethod(prop, { kind: 'method', computed: true }));
                const methodKeys = methods
                    .map((m) => {
                        const key = s.original.slice(m.key.start!, m.key.end!);
                        return key + ': this.' + key;
                    })
                    .join(',');
                const setupCall = `{ ...this${methods.length > 0 ? ',' : ''} ${methodKeys}}`;
                if (constructor) {
                    s.appendRight(constructor.end - 1, `\nthis.render = __render_${classDeclarationIndex};\n`);
                    s.appendRight(constructor.end - 1, `\nthis.setup = () => (${setupCall});\n`);
                } else {
                    s.appendRight((body.end ?? 1) - 1, `\nrender = __render_${classDeclarationIndex}\n`);
                    s.appendRight((body.end ?? 1) - 1, `\nsetup() { return ${setupCall}; };\n`);
                }
            };

            walkAST(ast, {
                enter(node) {
                    if (node.type === 'ClassDeclaration') {
                        classDeclarationIndex++;
                        const scopeHash = getHash(id + '#' + classDeclarationIndex);
                        const compMeta = ComponentMap.get(scopeHash);
                        if (compMeta) {
                            resolveTemplate(compMeta, node, scopeHash);
                        }
                    }
                }
            });

            await Promise.allSettled(promises);

            return {
                code: s.toString(),
                map: s.generateMap()
            };
        }
    };
}
