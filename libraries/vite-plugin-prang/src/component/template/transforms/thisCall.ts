import { CodeGenerator } from '@babel/generator';
import { identifier, isThisExpression } from '@babel/types';
import {
    type RootNode,
    type TemplateChildNode,
    type TransformContext,
    NodeTypes,
    createInterpolation
} from '@vue/compiler-core';
import { walkAST } from 'ast-kit';

export function thisCallTransform(node: RootNode | TemplateChildNode, ctx: TransformContext) {
    if (node.type !== NodeTypes.INTERPOLATION || !node.content.ast) return;
    let changed = false;
    const newAST = walkAST(node.content.ast, {
        enter(n) {
            if (isThisExpression(n)) {
                changed = true;
                this.replace(identifier('$setup'));
            }
        }
    });
    if (changed) {
        const generated = new CodeGenerator(newAST!).generate();
        console.log(generated);
        ctx.replaceNode(createInterpolation(generated.code, node.content.loc));
    }
}
