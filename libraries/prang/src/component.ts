import {
    CLASS_COMPONENT,
    PIPE,
    resolveSelector,
    type AnyClassImport,
    type ClassComponent,
    type ClassPipe
} from './internal';
import { createCommentVNode, onBeforeUnmount, onMounted, wrapReactiveClass } from './runtime';

export function Component(m?: ComponentMeta): Function {
    const meta = (m ?? { fileUrl: 'Unknown', render: () => createCommentVNode() }) as ProcessedComponentMeta;
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
        const componentName = [meta.selector].flat()[0] ?? component.name;
        component.__vType = CLASS_COMPONENT;
        component.__vSelector = meta.selector;

        component.__vccOpts = {
            name: componentName,
            __file: meta.fileUrl,
            components: Object.fromEntries(components),
            filters: Object.fromEntries(filters),
            setup(props) {
                const instance = new component();
                onMounted(() => {
                    if ('onInit' in instance && typeof instance['onInit'] === 'function') {
                        instance.onInit();
                    }
                });
                onBeforeUnmount(() => {
                    if ('onDestroy' in instance && typeof instance['onDestroy'] === 'function') {
                        instance.onDestroy();
                    }
                });

                const wrapped = wrapReactiveClass(instance);
                return (_ctx: any, cache: any) => meta.render.call(instance, instance, cache, props, wrapped);
            }
        };
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
}
