import {
    type ComponentNode,
    type RootNode,
    type TemplateChildNode,
    type TransformContext,
    ElementTypes,
    isCoreComponent,
    NodeTypes
} from '@vue/compiler-core';
import { kebabCase, pascalCase } from 'scule';
import { type ComponentMeta, ClassMetaMap, ClassType } from '../../internal';

export function importedComponentTransform(meta?: ComponentMeta) {
    // Resolve all imported components by their selectors
    const components = new Set<string>();

    const allComponents = Array.from(ClassMetaMap.values());
    meta?.imports?.forEach((binding) => {
        allComponents.find((meta) => {
            if (meta.sourceId === binding.source) {
                if (meta.className) {
                    components.add(pascalCase(meta.className));
                    components.add(kebabCase(meta.className));
                    components.add(meta.className);
                }
                if (meta.type === ClassType.COMPONENT && meta.selectors) {
                    meta.selectors.forEach((val) => {
                        components.add(val);
                    });
                }
            }
        });
    });

    return (node: RootNode | TemplateChildNode, ctx: TransformContext): void => {
        // If the 'element' is part of our selectors, treat is as a component
        if (node.type == NodeTypes.ELEMENT && node.tagType === ElementTypes.ELEMENT) {
            if (!isCoreComponent(node.tag) && components.has(node.tag)) {
                ctx.replaceNode({
                    ...(node as unknown as ComponentNode),
                    tagType: ElementTypes.COMPONENT
                });
            }
        }
    };
}
