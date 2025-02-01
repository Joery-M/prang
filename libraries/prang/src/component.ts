import { kebabCase } from 'scule';
import type { ComponentOptions } from 'vue';
import { onBeforeUnmount, onMounted, wrapReactiveClass } from './runtime';

export const CLASS_COMPONENT = Symbol();
export const PIPE = Symbol();

export function Component(m: ComponentMeta): Function {
    const meta = m as ProcessedComponentMeta;
    if (!meta.render) return Function();

    return (component: ClassComponent) => {
        const componentName = meta.selector ?? component.name;
        component.__vType = CLASS_COMPONENT;
        component.__vSelector = meta.selector;

        console.log(resolveComponents(meta.imports));
        component.__vccOpts = {
            name: componentName,
            __file: meta.fileUrl,
            components: resolveComponents(meta.imports),
            filters: resolvePipes(meta.imports),
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

function resolveComponents(imports?: readonly AnyClassImport[]) {
    if (!imports) return {};

    const importEntries: Record<string, ClassComponent> = {};

    imports.flat().forEach((imp) => {
        if (imp.__vType !== CLASS_COMPONENT) return;

        if (Array.isArray(imp.__vSelector)) {
            for (const selector of imp.__vSelector) {
                importEntries[selector] = imp;
            }
        } else if (imp.__vSelector) {
            importEntries[imp.__vSelector] = imp;
        } else {
            // Accept both versions: `my-component`
            importEntries[kebabCase(imp.name)] = imp;
            // and `MyComponent`
            importEntries[imp.name] = imp;
        }
    });
    return importEntries;
}

function resolvePipes(imports?: readonly AnyClassImport[]) {
    if (!imports) return {};

    return Object.fromEntries(
        imports
            .flat()
            .map((pipe) =>
                !Array.isArray(pipe) && '__vType' in pipe && pipe.__vType === PIPE
                    ? ([pipe.__vSelector ?? kebabCase(pipe.name), pipe] as const)
                    : undefined
            )
            .filter((v) => !!v)
    );
}
