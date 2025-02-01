import { kebabCase } from 'scule';
import type { ComponentOptions } from 'vue';
import { onBeforeUnmount, onMounted, wrapReactiveClass } from './runtime';

export const CLASS_COMPONENT = Symbol();
export const PIPE = Symbol();

export function Component(m: ComponentMeta): Function {
    const meta = m as ProcessedComponentMeta;
    if (!meta.render) return Function();

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
        const componentName = meta.selector ?? component.name;
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
                return (ctx: any, cache: any) => meta.render(instance, cache, props, wrapped);
            }
        };
    };
}

type Arrayable<T> = T | T[];
export type AnyClassImport = Arrayable<ClassComponent | ClassPipe>;

export interface ComponentMeta {
    selector?: string;
    templateUrl?: string;
    template?: string;
    styleUrls?: string[];
    styles?: string[];
    imports?: readonly AnyClassImport[];
    providers?: readonly any[];
}
interface ProcessedComponentMeta extends ComponentMeta {
    templateUrl: never;
    template: never;
    render: Function;
    fileUrl: string;
}

interface ClassComponent {
    new (...args: any[]): any;
    __vccOpts: ComponentOptions;
    __vType?: typeof CLASS_COMPONENT;
    __vSelector?: string;
}

interface ClassPipe {
    new (...args: any[]): any;
    __vType?: typeof PIPE;
    __vSelector?: string | string[];
}

function resolveSelector(value: ClassComponent | ClassPipe) {
    const map = new Map<string, ClassComponent | ClassPipe>();

    if (Array.isArray(value.__vSelector)) {
        for (const selector of value.__vSelector) {
            map.set(selector, value);
        }
    } else if (value.__vSelector) {
        map.set(value.__vSelector, value);
    } else {
        // Accept both versions: `my-component`
        map.set(kebabCase(value.name), value);
        // and `MyComponent`
        map.set(value.name, value);
    }
    return map;
}
