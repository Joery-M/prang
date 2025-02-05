import {
    CLASS_COMPONENT,
    isInput,
    PIPE,
    resolveSelector,
    type AnyClassImport,
    type ClassComponent,
    type ClassPipe
} from '../internal';
import { createCommentVNode, onBeforeUnmount, onMounted, provide, watch, type Prop } from '../runtime';

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
        component.__vType = CLASS_COMPONENT;
        component.__vSelector = meta.selector;
        // Name will change with minification, but its find
        (component as any).__vInjectionId = Symbol(component.name);

        component.__vccOpts = {
            __name: componentName,
            __file: meta.fileUrl,
            __scopeId: meta.scopeId ? 'data-v-' + meta.scopeId : undefined,
            components: Object.fromEntries(components),
            filters: Object.fromEntries(filters),
            props: meta.inputs,
            setup(props, { expose }) {
                const instance = new component();
                if ('onInit' in instance && typeof instance['onInit'] === 'function')
                    onMounted(() => instance.onInit());
                if ('onDestroy' in instance && typeof instance['onDestroy'] === 'function')
                    onBeforeUnmount(() => instance.onDestroy());

                // For non-compiled props
                watch(
                    props,
                    (propValues) => {
                        for (const [key, value] of Object.entries(propValues)) {
                            if (key in instance && isInput(instance[key])) {
                                const instProp = instance[key];
                                if (value !== instProp()) {
                                    (instProp as any).set(value);
                                }
                            }
                        }
                    },
                    { immediate: true }
                );

                expose({ [CLASS_COMPONENT]: instance });
                provide(component.__vInjectionId, instance);
                return (_ctx: any, cache: any) => meta.render.call(instance, instance, cache);
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
    scopeId: string;
    inputs?: Record<string, Prop<any>>;
    outputs?: string[];
}
