/**
 * @prang/core/runtime
 *
 * @license MIT
 */
import { computed, ReactiveFlags, shallowRef, toRefs, triggerRef } from '@vue/reactivity';
import {
    camelize,
    capitalize,
    getCurrentInstance,
    withDirectives as vWithDirectives,
    watchSyncEffect,
    type ComponentOptions,
    type DirectiveArguments,
    type VNode
} from '@vue/runtime-dom';
import { EMPTY_OBJ, hasChanged, hyphenate } from '@vue/shared';
import {
    CLASS_COMPONENT,
    isSignal,
    PIPE,
    SIGNAL_SOURCE,
    type ClassComponent,
    type DefineModelOptions
} from './internal';
import { signal, type ModelSignal, type Output, type ReadonlySignal } from './signal';

export * from '@vue/runtime-dom';
export { CLASS_COMPONENT } from './internal';

export function wrapClassComponent(component: InstanceType<ClassComponent>) {
    const i = getCurrentInstance()!;
    return new Proxy(component, {
        get(target, p, receiver) {
            if (p === '__isScriptSetup' || p === CLASS_COMPONENT) return true;

            return Reflect.get(target, p, receiver);
        },
        set(target, p: string, newValue, receiver) {
            if (typeof target[p] === 'function' && '__v_viewChild' in target[p]) {
                i.refs ||= {};
                i.refs[p] = newValue;
                return true;
            }
            return Reflect.set(target, p, newValue, receiver);
        }
    });
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

        if (typeof res === 'function' && res.__vType === PIPE) {
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

    const r = computed<T>(() => (props[propName].value === undefined ? defaultValue : props[propName].value) as T);
    const s = () => r.value;

    s['__v_isInput'] = true;
    s['__v_isInputCompiled'] = true;
    s[SIGNAL_SOURCE] = r;
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

const getModelModifiers = (props: Record<string, any>, modelName: string): Record<string, boolean> | undefined => {
    return modelName === 'modelValue' || modelName === 'model-value'
        ? props.modelModifiers
        : props[`${modelName}Modifiers`] ||
              props[`${camelize(modelName)}Modifiers`] ||
              props[`${hyphenate(modelName)}Modifiers`];
};

export function compiledModel<T, G = T, S = T>(
    name: string,
    defaultValue: T,
    options: DefineModelOptions<T, G, S> = {}
): ModelSignal<G, S> {
    const i = getCurrentInstance()!;
    if (!i) {
        console.warn(`compiledModel() called without active instance.`);
        return signal() as any;
    }

    const camelizedName = camelize(name);
    if (!(i as any).propsOptions[0][camelizedName]) {
        console.warn(
            `compiledModel() called with prop "${name}" which is not declared. This should have been handled by the compiler.`
        );
        return signal() as any;
    }

    const hyphenatedName = hyphenate(name);
    const modifiers = getModelModifiers(i.props, camelizedName);

    let prevSetValue: any = EMPTY_OBJ;
    let prevEmittedValue: any;

    const r = shallowRef(defaultValue);

    watchSyncEffect(() => {
        const propValue = i.props[camelizedName];
        if (hasChanged(r.value, propValue)) {
            r.value = propValue === undefined ? defaultValue : propValue;
        }
    });
    const s: any = () => {
        return options.get ? options.get(r.value) : r.value;
    };
    s.set = (value: any) => {
        const emittedValue = options.set ? options.set(value) : value;
        if (!hasChanged(emittedValue, r.value) && !(prevSetValue !== EMPTY_OBJ && hasChanged(value, prevSetValue))) {
            return;
        }
        const rawProps = i.vnode!.props;
        if (
            !(
                rawProps &&
                // check if parent has passed v-model
                (name in rawProps || camelizedName in rawProps || hyphenatedName in rawProps) &&
                (`onUpdate:${name}` in rawProps ||
                    `onUpdate:${camelizedName}` in rawProps ||
                    `onUpdate:${hyphenatedName}` in rawProps)
            )
        ) {
            // no v-model, local update
            r.value = value;
        }

        i.emit(`update:${name}`, emittedValue);
        // #10279: if the local value is converted via a setter but the value
        // emitted to parent was the same, the parent will not trigger any
        // updates and there will be no prop sync. However the local input state
        // may be out of sync, so we need to force an update here.
        if (
            hasChanged(value, emittedValue) &&
            hasChanged(value, prevSetValue) &&
            !hasChanged(emittedValue, prevEmittedValue)
        ) {
            triggerRef(r);
        }
        prevSetValue = value;
        prevEmittedValue = emittedValue;
    };
    s.update = (updater: (original: any) => any) => {
        s.set(updater(r.value));
    };

    s[Symbol.iterator] = () => {
        let i = 0;
        return {
            next() {
                if (i < 2) {
                    return { value: i++ ? modifiers || EMPTY_OBJ : s, done: false };
                } else {
                    return { done: true };
                }
            }
        };
    };
    s[SIGNAL_SOURCE] = r;
    s[ReactiveFlags.IS_SHALLOW] = true;
    return s as ModelSignal<G, S>;
}
