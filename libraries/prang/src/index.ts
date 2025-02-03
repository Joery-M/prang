/**
 * @prang/core
 *
 * @license MIT
 */

export { bootstrapComponent } from './app';
export { Component } from './component';
export * from './component/hooks';
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
