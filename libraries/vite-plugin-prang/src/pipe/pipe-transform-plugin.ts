import { parseSync } from 'oxc-parser';
import type { Plugin } from 'vite';
import { walk } from 'zimmerframe';
import type { OxcNode } from '../types';

export function PipeTransformPlugin(): Plugin {
    return {
        name: 'prang:pipe-transform',
        transform(code, id) {
            if (id.includes('/node_modules/') || !code.includes('@prang/core') || !code.includes('class')) return;

            const ast = parseSync(id, code);

            let pipeIdentifier: string = 'Pipe';

            let classDeclarationIndex = -1;

            walk(
                ast.program as OxcNode,
                {},
                {
                    ImportSpecifier(n, ctx) {
                        const decl = ctx.path.at(-1);
                        if (
                            decl &&
                            decl.type === 'ImportDeclaration' &&
                            decl.source.value === '@prang/core' &&
                            n.imported.type === 'Identifier' &&
                            n.imported.name === 'Pipe'
                        ) {
                            pipeIdentifier = n.local.name;
                        }
                    },
                    ClassDeclaration: (n: Class) => {
                        const astHandler = async () => {
                            classDeclarationIndex++;
                            if (n.decorators.length == 0) return;
                            for (const decorator of n.decorators) {
                                if (
                                    decorator.expression.type !== 'CallExpression' ||
                                    decorator.expression.callee.type !== 'Identifier' ||
                                    decorator.expression.callee.name !== componentIdent
                                )
                                    continue;
                                let meta: ComponentMeta | undefined;
                                for (const arg of decorator.expression.arguments) {
                                    if (arg.type !== 'ObjectExpression') continue;
                                    const newMeta = await getComponentMeta(arg, id, classDeclarationIndex, this);
                                    if (newMeta) {
                                        meta = {
                                            ...newMeta,
                                            sourceId: id,
                                            span: { start: n.start, end: n.end }
                                        };
                                    }
                                }

                                ast.magicString.remove(decorator.start, decorator.end);

                                if (meta) {
                                    ComponentMap.set(id + '#' + classDeclarationIndex, meta);
                                }
                            }
                        };
                        promises.push(astHandler());
                    }
                }
            );
        }
    };
}
