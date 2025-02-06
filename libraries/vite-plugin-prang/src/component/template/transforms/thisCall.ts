import { isMemberExpression, isThisExpression } from '@babel/types';
import {
    type AttributeNode,
    type DirectiveNode,
    type ExpressionNode,
    type NodeTransform,
    NodeTypes,
    type SimpleExpressionNode,
    type TransformContext
} from '@vue/compiler-core';
import { walkAST } from 'ast-kit';
import MagicString from 'magic-string';

export const thisCallTransform: NodeTransform = (node, context) => {
    if (node.type === NodeTypes.INTERPOLATION) {
        // filter rewrite is applied before expression transform so only
        // simple expressions are possible at this stage
        rewriteThis(node.content, context);
    } else if (node.type === NodeTypes.ELEMENT) {
        node.props.forEach((prop: AttributeNode | DirectiveNode) => {
            if (prop.type === NodeTypes.DIRECTIVE && prop.exp) {
                rewriteThis(prop.exp, context);
            }
        });
    }
    if (node.type !== NodeTypes.INTERPOLATION || !node.content.ast) return;
};
function rewriteThis(node: ExpressionNode, context: TransformContext) {
    if (node.type === NodeTypes.SIMPLE_EXPRESSION) {
        parseThis(node);
    } else {
        // Cant find a case where this section still applies, yet.
        // Maybe if there are other expression rewrites before this
        for (let i = 0; i < node.children.length; i++) {
            const child = node.children[i];
            if (typeof child !== 'object') continue;
            if (child.type === NodeTypes.SIMPLE_EXPRESSION) {
                parseThis(child);
            } else if (child.type === NodeTypes.COMPOUND_EXPRESSION) {
                rewriteThis(node, context);
            } else if (child.type === NodeTypes.INTERPOLATION) {
                rewriteThis(child.content, context);
            }
        }
    }
}
function parseThis(node: SimpleExpressionNode) {
    if (!node.ast) return;

    const s = new MagicString(node.content, { offset: -node.ast.start! });
    walkAST(node.ast, {
        enter(n, parent) {
            if (isThisExpression(n) && isMemberExpression(parent) && parent.object === n) {
                s.remove(n.start!, n.end! + 1);
            } else if (isThisExpression(n)) {
                s.remove(n.start!, n.end!);
            }
        }
    });

    if (s.hasChanged()) {
        node.content = s.toString();
        node.ast = undefined;
    }
}
