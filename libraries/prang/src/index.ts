import { ReactiveFlags, shallowRef, computed as vComputed } from '@vue/reactivity';
import { getCurrentInstance } from 'vue';

export { bootstrapComponent } from './app';
export { Component } from './component';
export { Pipe } from './pipe';

export type ReadonlySignal<T = any> = {
    (): T;
};
export type Signal<T = any> = ReadonlySignal<T> & {
    set: (value: T) => void;
    update: (updater: (original: T) => T) => void;
};

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
export function input<T>(defaultValue?: T): ReadonlySignal<T> {
    const r = shallowRef(defaultValue);
    const s = () => r.value;

    s['set'] = (newVal: T) => (r.value = newVal);
    s['__v_isInput'] = true;
    s[ReactiveFlags.IS_READONLY] = true;
    s[ReactiveFlags.IS_SHALLOW] = true;
    return s;
}
