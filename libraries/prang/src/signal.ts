import {
    ReactiveFlags,
    shallowRef,
    computed as vComputed,
    type MaybeRef,
    type ShallowUnwrapRef
} from '@vue/reactivity';
import { useTemplateRef } from '@vue/runtime-dom';
import { NOOP } from '@vue/shared';
import { SIGNAL_SOURCE, type DefineModelOptions } from './internal';

export type ReadonlySignal<T = any> = () => T;
export interface Signal<T = any, S = T> extends ReadonlySignal<T> {
    set: (value: S) => void;
    update: (updater: (original: T) => S) => void;
}
export interface ModelSignal<T, S = T> extends Signal<T, S> {
    [Symbol.iterator](): Iterator<Signal<T, S>>;
}

export interface Output<T extends any | readonly any[]> {
    (...v: T extends Array<any> ? T : [T]): void;
}

export function signal<T>(initialValue: T): Signal<T>;
export function signal<T = any>(): Signal<T | undefined>;
export function signal<T>(initialValue?: MaybeRef<T>): Signal<ShallowUnwrapRef<T>> {
    const r = shallowRef(initialValue);
    const s: any = () => r.value;
    s.set = (value: T) => {
        r.value = value;
    };
    s.update = (updater: (original: T) => T) => {
        r.value = updater(r.value);
    };
    s[SIGNAL_SOURCE] = r;

    return s;
}

export interface ComputedOptions<T> {
    equal?: (a: T, b: T) => boolean;
}
export function computed<T>(fn: () => T, opts?: ComputedOptions<T>): ReadonlySignal<T>;
export function computed<T>(fn: () => T, opts?: ComputedOptions<T>): ReadonlySignal<T> {
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
    const s: any = () => c.value;
    s[SIGNAL_SOURCE] = c;
    return s;
}

export function input<T>(): ReadonlySignal<T | undefined>;
export function input<T>(defaultValue: T): ReadonlySignal<T>;
export function input<T>(defaultValue?: T): ReadonlySignal<T> {
    console.warn(
        'input(defaultValue) is a compiler macro that should be transformed to compiledInput(propName, defaultValue) from "@prang/core/runtime"'
    );
    return NOOP as ReadonlySignal<T>;
}

export function output<T extends any | readonly any[] = any>(): Output<T> {
    console.warn(
        'output() is a compiler macro that should be transformed to compiledOutput(propName) from "@prang/core/runtime"'
    );
    return NOOP as Output<T>;
}

export function model<T>(): Signal<T | undefined>;
export function model<T, G = T, S = T>(defaultValue: T, options?: DefineModelOptions<T, G, S>): ModelSignal<G, S>;
export function model<T, G = T, S = T>(defaultValue?: T, options?: DefineModelOptions<T, G, S>): ModelSignal<G, S> {
    console.warn(
        'model(defaultValue) is a compiler macro that should be transformed to compiledModel(propName, defaultValue) from "@prang/core/runtime"'
    );
    return NOOP as ModelSignal<G, S>;
}

export function viewChild<T = any>(selector: string) {
    const template = useTemplateRef<T>(selector);

    const s = () => template.value;
    s[SIGNAL_SOURCE] = template;
    s[ReactiveFlags.IS_READONLY] = true;
    // Stop runtime from complaining
    s[ReactiveFlags.IS_REF] = true;
    s[ReactiveFlags.RAW] = true;
    s['__v_viewChild'] = true;
    return s as ReadonlySignal<T | null>;
}
