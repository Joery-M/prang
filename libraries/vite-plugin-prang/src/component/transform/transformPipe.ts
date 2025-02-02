/**
 * Original code was copied from @vue/compiler-core, then
 * I changed the manual parsing of the expression to use
 * AST transforms instead
 *
 * https://github.com/vuejs/core/blob/22f359bdbe174c4983ed031e8583bf08b6c6c3cb/packages/compiler-core/src/compat/transformFilter.ts
 */

import { CodeGenerator } from '@babel/generator';
import {
    callExpression,
    identifier,
    isBinaryExpression,
    isCallExpression,
    isIdentifier,
    isPrivateName,
    type BinaryExpression,
    type CallExpression,
    type Expression,
    type Identifier
} from '@babel/types';
import {
    NodeTypes,
    RESOLVE_FILTER,
    toValidAssetId,
    type ExpressionNode,
    type NodeTransform,
    type SimpleExpressionNode,
    type TransformContext
} from '@vue/compiler-core';

export const transformFilter: NodeTransform = (node, context) => {
    if (node.type === NodeTypes.INTERPOLATION) {
        // filter rewrite is applied before expression transform so only
        // simple expressions are possible at this stage
        rewriteFilter(node.content, context);
    } else if (node.type === NodeTypes.ELEMENT) {
        node.props.forEach((prop) => {
            if (prop.type === NodeTypes.DIRECTIVE && prop.name !== 'for' && prop.exp) {
                rewriteFilter(prop.exp, context);
            }
        });
    }
};

function rewriteFilter(node: ExpressionNode, context: TransformContext) {
    if (node.type === NodeTypes.SIMPLE_EXPRESSION) {
        parseFilter(node, context);
    } else {
        for (let i = 0; i < node.children.length; i++) {
            const child = node.children[i];
            if (typeof child !== 'object') continue;
            if (child.type === NodeTypes.SIMPLE_EXPRESSION) {
                parseFilter(child, context);
            } else if (child.type === NodeTypes.COMPOUND_EXPRESSION) {
                rewriteFilter(node, context);
            } else if (child.type === NodeTypes.INTERPOLATION) {
                rewriteFilter(child.content, context);
            }
        }
    }
}

function parseFilter(node: SimpleExpressionNode, context: TransformContext) {
    if (!node.ast || !isBinaryExpression(node.ast, { operator: '|' })) return;

    let finalExpression: Exclude<Expression, BinaryExpression> | undefined;
    const stack: (Identifier | CallExpression)[] = [];
    const walkBinaryStack = (exp: BinaryExpression) => {
        if (isIdentifier(exp.right) || isCallExpression(exp.right)) {
            stack.push(exp.right);
        }
        if (isBinaryExpression(exp.left, { operator: '|' })) {
            walkBinaryStack(exp.left);
        } else if (!isPrivateName(exp.left)) {
            finalExpression = exp.left;
        }
    };
    walkBinaryStack(node.ast);

    if (!finalExpression) return;

    // If identifier, make it a call expression with the previous item as first arg
    // If call expression, add the previous exp as the first argument
    const result = stack.reduceRight((prev, cur) => {
        if (isIdentifier(cur)) {
            const newName = toValidAssetId(cur.name, 'filter');
            context.filters?.add(cur.name);
            return callExpression(identifier(newName), [prev]);
        } else if (isCallExpression(cur)) {
            // If its a direct identifier, assume its an imported pipe
            // Else if its a member expression (e.g. this.capitalize), use that directly
            if (isIdentifier(cur.callee)) {
                const newName = toValidAssetId(cur.callee.name, 'filter');
                context.filters?.add(cur.callee.name);
                return callExpression(identifier(newName), [prev, ...cur.arguments]);
            } else {
                return callExpression(cur.callee, [prev, ...cur.arguments]);
            }
        } else {
            return cur;
        }
    }, finalExpression);

    // Typescript gets angry if I just use `import generate from '@babel/generator';`
    const generated = new CodeGenerator(result).generate();

    context.helper(RESOLVE_FILTER);
    node.content = generated.code;
    node.ast = undefined;
}
