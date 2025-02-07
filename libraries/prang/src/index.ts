export { bootstrapComponent } from './app';
export { Component } from './component/component';
export * from './component/hooks';
export { inject, Injectable, provide } from './injectable/injectable';
export { isSignal } from './internal';
export { Pipe } from './pipe';
export * from './signal';

// Re-export useful functions that work with signals
export {
    effect,
    isProxy,
    isReactive,
    isReadonly,
    isRef,
    isShallow,
    markRaw,
    reactive,
    toValue,
    watch
} from '@vue/reactivity';
