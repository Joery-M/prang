import { shallowRef, computed as vComputed } from 'vue';

export { bootstrapComponent } from './app';
export { Component } from './component';
export { Pipe } from './pipe';

export const signal = <T>(initialValue: T) => {
    const r = shallowRef(initialValue);
    const s = () => r.value;
    s.set = (value: T) => {
        r.value = value;
    };
    s.update = (updater: (original: T) => T) => {
        r.value = updater(r.value);
    };
    return s;
};

export interface ComputedOptions<T> {
    equal?: (a: T, b: T) => boolean;
}
export const computed = <T>(fn: () => T, opts?: ComputedOptions<T>): (() => T) => {
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
