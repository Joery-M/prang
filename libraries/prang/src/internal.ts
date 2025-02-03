import type { ComponentOptions } from 'vue';
import { isSignal, type ReadonlySignal } from '.';

export const SIGNAL_SOURCE = Symbol('Signal source');
export const COMPUTED_SIGNAL = Symbol('Signal');
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
        console.warn('Could not find selector for', value);
    }
    return map;
}

export function isInput<T>(r: ReadonlySignal<T> | unknown): r is ReadonlySignal<T> {
    return r ? (r as any)['__v_isInput'] === true && !(r as any)['__v_isInputCompiled'] : false;
}

export function ifSignalToRef<T, V = Exclude<T, ReadonlySignal>>(s: T): V {
    return isSignal(s) ? (s as any)[SIGNAL_SOURCE] : (s as unknown as V);
}
