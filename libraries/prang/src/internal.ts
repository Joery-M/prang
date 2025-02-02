import { camelCase, kebabCase } from 'scule';
import type { ComponentOptions } from 'vue';
import type { ReadonlySignal } from '.';

export const CLASS_COMPONENT = Symbol();
export const PIPE = Symbol.for('pipe');

export interface ClassPipe {
    new (...args: any[]): any;
    __vType?: typeof PIPE;
    __vSelector?: string;
    __vInstance?: any;
    transform?: (...args: any[]) => any;
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
        if (value.__vType === CLASS_COMPONENT) {
            // Accept both versions: `my-component` and `MyComponent`
            map.set(kebabCase(value.name), value);
            map.set(value.name, value);
        } else if (value.__vType === PIPE) {
            map.set(camelCase(value.name), value);
        }
    }
    return map;
}

export function isInput<T>(r: ReadonlySignal<T> | unknown): r is ReadonlySignal<T> {
    return r ? (r as any)['__v_isInput'] === true && !(r as any)['__v_isInputCompiled'] : false;
}
