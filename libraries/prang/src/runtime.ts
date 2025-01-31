import {
    isProxy,
    isRef,
    toValue,
    withDirectives as vWithDirectives,
    type DirectiveArguments,
    type VNode
} from '@vue/runtime-core';
import type { Signal } from '.';

export * from '@vue/runtime-core';
export * from '@vue/runtime-dom';

export function isSignal<T>(r: Signal<T> | unknown): r is Signal<T> {
    return r ? (r as any)['__v_isSignal'] === true : false;
}

export function wrapReactiveClass<T extends object>(comp: T): T {
    const proxied = new Proxy(comp, {
        get(target: any, p, receiver) {
            const prop = target[p];
            console.log('GET', target, p, receiver);
            if (isProxy(prop) || isRef(prop)) {
                return toValue(prop);
            }
            return Reflect.get(target, p, receiver);
        },
        set(target: any, p, newValue, receiver) {
            const prop = target[p];
            console.log('SET', target, p, newValue);
            if (isProxy(prop) || isRef(prop)) {
                if (isSignal(prop)) {
                    prop.set(newValue);
                } else {
                    prop.value = newValue;
                }
                return true;
            }
            return Reflect.set(target, p, newValue, receiver);
        }
    });

    return proxied;
}

export function withDirectives<T extends VNode>(vnode: T, directives: DirectiveArguments) {
    for (const dir of directives) {
        const val = dir[1];
        if (isSignal(val)) {
            dir[1] = val();
        }
    }
    return vWithDirectives(vnode, directives);
}
