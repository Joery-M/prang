import { kebabCase } from 'scule';
import type { ComponentOptions } from 'vue';

export const CLASS_COMPONENT = Symbol();
export const PIPE = Symbol();

export interface ClassPipe {
    new (...args: any[]): any;
    __vType?: typeof PIPE;
    __vSelector?: string | string[];
}

export interface ClassComponent {
    new (...args: any[]): any;
    __vccOpts: ComponentOptions;
    __vType?: typeof CLASS_COMPONENT;
    __vSelector?: string | string[];
}

type Arrayable<T> = T | T[];
export type AnyClassImport = Arrayable<ClassComponent | ClassPipe>;

export function resolveSelector(value: ClassComponent | ClassPipe) {
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
