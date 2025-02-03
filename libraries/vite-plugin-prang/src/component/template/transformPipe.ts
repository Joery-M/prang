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
    isMemberExpression,
    isPrivateName,
    type BinaryExpression,
    type Expression
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
import { walkAST } from 'ast-kit';

export const transformPipe: NodeTransform = (node, context) => {
    if (node.type === NodeTypes.INTERPOLATION) {
        // filter rewrite is applied before expression transform so only
        // simple expressions are possible at this stage
        rewritePipe(node.content, context);
    } else if (node.type === NodeTypes.ELEMENT) {
        node.props.forEach((prop) => {
            if (prop.type === NodeTypes.DIRECTIVE && prop.name !== 'for' && prop.exp) {
                rewritePipe(prop.exp, context);
            }
        });
    }
};

function rewritePipe(node: ExpressionNode, context: TransformContext) {
    if (node.type === NodeTypes.SIMPLE_EXPRESSION) {
        parsePipe(node, context);
    } else {
        // Cant find a case where this section still applies, yet.
        // Maybe if there are other expression rewrites before this
        for (let i = 0; i < node.children.length; i++) {
            const child = node.children[i];
            if (typeof child !== 'object') continue;
            if (child.type === NodeTypes.SIMPLE_EXPRESSION) {
                parsePipe(child, context);
            } else if (child.type === NodeTypes.COMPOUND_EXPRESSION) {
                rewritePipe(node, context);
            } else if (child.type === NodeTypes.INTERPOLATION) {
                rewritePipe(child.content, context);
            }
        }
    }
}

function parsePipe(node: SimpleExpressionNode, context: TransformContext) {
    if (!node.ast) return;

    let changed = false;
    const result = walkAST(node.ast, {
        enter(node) {
            if (node.type === 'BinaryExpression' && node.operator === '|') {
                const res = transformBinaryExp(node, context);
                if (res) {
                    this.replace(res);
                    changed = true;
                }
            }
        }
    });
    if (!changed || !result) return;

    // Typescript gets angry if I just use `import generate from '@babel/generator';`
    const generated = new CodeGenerator(result).generate();

    context.helper(RESOLVE_FILTER);
    node.content = generated.code;
    node.ast = undefined;
}

function transformBinaryExp(exp: BinaryExpression, context: TransformContext) {
    let finalExpression: Exclude<Expression, BinaryExpression> | undefined;
    const stack: Expression[] = [];
    const walkBinaryStack = (exp: BinaryExpression) => {
        if (isIdentifier(exp.right) || isCallExpression(exp.right) || isMemberExpression(exp.right)) {
            stack.push(exp.right);
        }
        if (isBinaryExpression(exp.left, { operator: '|' })) {
            walkBinaryStack(exp.left);
        } else if (!isPrivateName(exp.left)) {
            finalExpression = exp.left;
        }
    };
    walkBinaryStack(exp);

    if (!finalExpression) return;

    // If identifier, make it a call expression with the previous item as first arg
    // If member expression, same treatment as identifier, but with member exp
    // If call expression, add the previous exp as the first argument
    const result = stack.reduceRight((prev, cur) => {
        if (isIdentifier(cur)) {
            const newName = toValidAssetId(cur.name, 'filter');
            context.filters?.add(cur.name);
            return callExpression(identifier(newName), [prev]);
        } else if (isMemberExpression(cur)) {
            return callExpression(cur, [prev]);
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

    return result;
}
