import {
    isCallExpression,
    isLiteral,
    isObjectExpression,
    isObjectProperty,
    objectExpression,
    toKeyAlias,
    type ClassDeclaration,
    type Decorator,
    type ObjectExpression
} from '@babel/types';
import {
    babelParse,
    resolveIdentifier,
    resolveString,
    walkASTAsync,
    walkImportDeclaration,
    type ImportBinding
} from 'ast-kit';
import path from 'pathe';
import type { PluginContext } from 'rollup';
import { camelCase } from 'scule';
import { ClassType, type ClassMeta } from '../internal';
import { getHash, isImportOf } from '../utils';
import { getComponentMeta } from './component';

/**
 * Parse code, find components, return metadata for each component.
 */
export async function getModuleInfo(code: string, id: string, ctx: PluginContext): Promise<Map<string, ClassMeta>> {
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

    let classDeclarationIndex = -1;

    const imports: Record<string, ImportBinding> = {};

    const curClassMap: Map<string, ClassMeta> = new Map();

    async function handleComponentDec(node: ClassDeclaration, decorator: Decorator) {
        if (
            !isCallExpression(decorator.expression) ||
            !isImportOf(decorator.expression.callee, imports, 'Component', 'prang')
        )
            return;

        const scopeHash = getHash(id + '#' + classDeclarationIndex);

        let decArg: ObjectExpression | undefined = isObjectExpression(decorator.expression.arguments[0])
            ? decorator.expression.arguments[0]
            : undefined;

        if (!decArg) {
            decArg = objectExpression([]);
            decArg.start = decorator.expression.end! - 1;
        }
        const meta = await getComponentMeta(decArg, node, id, scopeHash, imports, ctx);

        curClassMap.set(scopeHash, meta);
    }

    async function handlePipeDec(node: ClassDeclaration, decorator: Decorator) {
        if (
            !isCallExpression(decorator.expression) ||
            !isImportOf(decorator.expression.callee, imports, 'Pipe', 'prang')
        )
            return;
        const className = node.id ? resolveIdentifier(node.id)[0] : undefined;
        if (!className) {
            ctx.error({
                loc: node.body.loc!.start,
                id,
                message: '@Pipe requires class to have a name'
            });
        }

        const scopeHash = getHash(id + '#' + classDeclarationIndex);

        let name = camelCase(className);
        const obj = decorator.expression.arguments[0];
        if (obj && isObjectExpression(obj)) {
            obj.properties.forEach((prop) => {
                if (isObjectProperty(prop) && toKeyAlias(prop) === 'name' && isLiteral(prop.value)) {
                    name = resolveString(prop.value);
                }
            });
        }

        curClassMap.set(scopeHash, {
            type: ClassType.PIPE,
            name,
            className,
            sourceId: id
        });
    }

    await walkASTAsync(ast, {
        enter: async (node) => {
            switch (node.type) {
                case 'ImportDeclaration': {
                    walkImportDeclaration(imports, node);
                    break;
                }
                case 'ClassDeclaration': {
                    classDeclarationIndex++;
                    if (!node.decorators || node.decorators.length == 0) return;
                    for await (const decorator of node.decorators) {
                        await handleComponentDec(node, decorator);
                        await handlePipeDec(node, decorator);
                    }
                }
            }
        }
    });
    return curClassMap;
}
