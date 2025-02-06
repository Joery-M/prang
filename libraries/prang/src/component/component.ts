import {
    CLASS_COMPONENT,
    PIPE,
    resolveSelector,
    type AnyClassImport,
    type ClassComponent,
    type ClassPipe
} from '../internal';
import { createCommentVNode, type Prop } from '../runtime';

export function Component(m?: ComponentMeta): Function {
    const meta = Object.assign(
        { fileUrl: 'Unknown', render: () => createCommentVNode(), scopeId: '' },
        m || {}
    ) as ProcessedComponentMeta;
    if (!meta?.render) return Function();

    const components = new Map<string, ClassComponent>();
    const filters = new Map<string, ClassPipe>();
    meta.imports?.flat().forEach((imp) => {
        const resolved = resolveSelector(imp);
        for (const entry of resolved.entries()) {
            switch (entry[1].__vType) {
                case CLASS_COMPONENT:
                    components.set(entry[0], entry[1]);
                    break;
                case PIPE:
                    filters.set(entry[0], entry[1]);
                    break;
            }
        }
    });

    return (component: ClassComponent) => {
        const componentName = [meta.selector].flat()[0];
        component.__vSelector = meta.selector;
        component.__vccOpts.__name = componentName;
        component.__vccOpts.components = Object.fromEntries(components);
        component.__vccOpts.filters = Object.fromEntries(filters);
    };
}

export interface ComponentMeta {
    selector?: string | string[];
    templateUrl?: string;
    template?: string;
    styleUrls?: string[];
    styles?: string[];
    imports?: readonly AnyClassImport[];
    providers?: readonly any[];
}

/**
 * Component decorator argument after being processed by the vite plugin
 */
interface ProcessedComponentMeta extends ComponentMeta {
    templateUrl?: never;
    template?: never;
    render: Function;
    fileUrl: string;
    scopeId: string;
    inputs?: Record<string, Prop<any>>;
    outputs?: string[];
}
