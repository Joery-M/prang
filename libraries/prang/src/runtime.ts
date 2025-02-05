/**
 * @prang/core/runtime
 *
 * @license MIT
 */
import { computed, ReactiveFlags, ref, shallowRef, toRefs, triggerRef, watch } from '@vue/reactivity';
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
import { isSignal, SIGNAL_SOURCE, type DefineModelOptions } from './internal';
import { signal, type ModelSignal, type Output, type ReadonlySignal } from './signal';

export * from '@vue/runtime-dom';

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
        watch(props[propName], () => (useDefault.value = false), { once: true });
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
        console.warn(`useModel() called without active instance.`);
        return signal() as any;
    }

    const camelizedName = camelize(name);
    if (!(i as any).propsOptions[0][camelizedName]) {
        console.warn(`useModel() called with prop "${name}" which is not declared.`);
        return signal() as any;
    }

    const hyphenatedName = hyphenate(name);
    const modifiers = getModelModifiers(i.props, camelizedName);

    let prevSetValue: any = EMPTY_OBJ;
    let prevEmittedValue: any;

    let isCurrentlyDefault = defaultValue !== undefined;
    i.props[camelizedName]!.default = defaultValue;
    const r = shallowRef(defaultValue);

    watchSyncEffect(() => {
        const propValue = i.props[camelizedName];
        console.log('Changed?', r.value, propValue);
        if (!isCurrentlyDefault && hasChanged(r.value, propValue)) {
            r.value = propValue;
        }
    });
    const s: any = () => {
        console.log('GET', r.value);
        return options.get ? options.get(r.value) : r.value;
    };
    s.set = (value: any) => {
        isCurrentlyDefault = false;
        console.log('SET', value);
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
    s[ReactiveFlags.IS_REF] = true;
    s[ReactiveFlags.IS_SHALLOW] = true;
    return s as ModelSignal<G, S>;
}
