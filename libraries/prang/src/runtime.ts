import { ReactiveFlags, computed, isProxy, isRef, ref, toRefs, toValue, watch } from '@vue/reactivity';
import {
    camelize,
    capitalize,
    getCurrentInstance,
    withDirectives as vWithDirectives,
    type ComponentOptions,
    type DirectiveArguments,
    type VNode
} from '@vue/runtime-core';
import type { Output, ReadonlySignal, Signal } from '.';

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

export function resolveFilter(name: string) {
    const instance = getCurrentInstance();
    const type = 'filters';
    if (instance) {
        const Component = instance.type;

        let res =
            // local registration
            // check instance[type] first which is resolved for options API
            resolve((instance as any)[type] || (Component as ComponentOptions)[type], name) ||
            // global registration
            resolve((instance.appContext as any)[type], name);

        if (typeof res === 'function' && res.__vType === Symbol.for('pipe')) {
            if (!res.__vInstance) {
                res.__vInstance = new res();
            }
            res = res.__vInstance?.transform ?? res;
        }

        if (!res) {
            const extra = ``;
            console.warn(`Failed to resolve ${type.slice(0, -1)}: ${name}${extra}`);
        }

        return res;
    } else if (true) {
        console.warn(`resolve${capitalize(type.slice(0, -1))} ` + `can only be used in render() or setup().`);
    }
}

function resolve(registry: Record<string, any> | undefined, name: string) {
    return registry && (registry[name] || registry[camelize(name)] || registry[capitalize(camelize(name))]);
}

export function compiledInput<T>(propName: string, defaultValue?: T): ReadonlySignal<T> {
    const inst = getCurrentInstance();
    if (!inst) throw new Error('Compiled input was called without active instance');
    const props = toRefs(inst.props);
    const useDefault = ref(false);
    if (defaultValue !== undefined) {
        useDefault.value = true;
        watch(props[propName], (v) => (useDefault.value = false), { once: true });
    }

    const r = computed<T>(() => (useDefault.value || !(propName in props) ? defaultValue : props[propName].value) as T);
    const s = () => r.value;

    s['__v_isInput'] = true;
    s['__v_isInputCompiled'] = true;
    s[ReactiveFlags.IS_READONLY] = true;
    s[ReactiveFlags.IS_SHALLOW] = true;
    return s;
}

export function compiledOutput<T extends any | readonly any[] = any>(propName: string): Output<T> {
    const inst = getCurrentInstance();
    if (!inst) throw new Error('Compiled output was called without active instance');

    return (...args: T extends Array<any> ? T : [T]) => {
        inst.emit(propName, ...args);
    };
}
