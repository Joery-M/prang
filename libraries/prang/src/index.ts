/**
 * @prang/core
 *
 * @license MIT
 */
import { ReactiveFlags, shallowRef, computed as vComputed } from '@vue/reactivity';
import { useTemplateRef } from 'vue';
import { CLASS_COMPONENT } from './internal';

export { bootstrapComponent } from './app';
export { Component } from './component';
export * from './component/hooks';
export { Pipe } from './pipe';

// Re-export useful functions that work with signals
export {
    watch,
    effect,
    markRaw,
    reactive,
    isProxy,
    isReactive,
    isReadonly,
    isRef,
    isShallow,
    toValue
} from '@vue/reactivity';

export type ReadonlySignal<T = any> = {
    (): T;
};
export type Signal<T = any> = ReadonlySignal<T> & {
    set: (value: T) => void;
    update: (updater: (original: T) => T) => void;
};
export interface Output<T extends any | readonly any[]> {
    (...v: T extends Array<any> ? T : [T]): void;
}

export const signal = <T>(initialValue: T): Signal<T> => {
    const r = shallowRef(initialValue);
    const s = () => r.value;
    s.set = (value: T) => {
        r.value = value;
    };
    s.update = (updater: (original: T) => T) => {
        r.value = updater(r.value);
    };
    s[ReactiveFlags.IS_REF] = true;
    s[ReactiveFlags.IS_SHALLOW] = true;
    s['__v_isSignal'] = true;

    return s;
};
export function isSignal<T>(r: Signal<T> | unknown): r is Signal<T> {
    return r ? (r as any)['__v_isSignal'] === true : false;
}

export interface ComputedOptions<T> {
    equal?: (a: T, b: T) => boolean;
}
export const computed = <T>(fn: () => T, opts?: ComputedOptions<T>): ReadonlySignal<T> => {
    const c = vComputed<T>((oldVal) => {
        const newVal = fn();
        if (opts?.equal) {
            if (oldVal && opts.equal(newVal, oldVal)) {
                return oldVal;
            } else {
                return newVal;
            }
        }
        return newVal;
    });
    const s = () => c.value;
    return s;
};

export function input<T>(): ReadonlySignal<T | undefined>;
export function input<T>(defaultValue: T): ReadonlySignal<T>;
export function input<T>(defaultValue?: T): ReadonlySignal<T> {
    const r = shallowRef(defaultValue);
    const s = () => r.value;

    s['set'] = (newVal: T) => (r.value = newVal);
    s['__v_isInput'] = true;
    s[ReactiveFlags.IS_READONLY] = true;
    s[ReactiveFlags.IS_SHALLOW] = true;
    return s;
}

export function output<T extends any | readonly any[] = any>(): Output<T> {
    return (...args: T extends Array<any> ? T : [T]) => {
        // inst.emit(propName, args.flat(1));
    };
}

export function viewChild<T = any>(selector: string) {
    const template = useTemplateRef<T>(selector);

    const s = () => {
        const val = template.value as any;
        return val && CLASS_COMPONENT in val ? (val[CLASS_COMPONENT] as T) : val;
    };
    s[ReactiveFlags.IS_READONLY] = true;
    s[ReactiveFlags.IS_SHALLOW] = true;
    return s as ReadonlySignal<T | null>;
}
