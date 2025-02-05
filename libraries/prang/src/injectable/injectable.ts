import { getCurrentInstance, type ComponentInternalInstance } from '@vue/runtime-dom';
import { INJECTABLE_CLASS, INJECTION_ID, type InjectableClass } from '../internal';
import { inject as vInject, provide as vProvide } from '../runtime';

export function Injectable(meta: InjectableMeta = {}): Function {
    return (injectable: InjectableClass) => {
        // Name will change with minification, but its find
        (injectable as any).__vInjectionId = Symbol(injectable.name);
        injectable.__vType = INJECTABLE_CLASS;

        if (meta.providedIn === 'root') {
            injectable.__vInit = () => {
                const instance = new injectable();

                const i = getCurrentInstance()!;
                i.appContext.app.provide(injectable.__vInjectionId, instance);
                return instance;
            };
        } else {
            injectable.__vInit = (context?: ComponentInternalInstance) => {
                if (!context) return;

                const instance = new injectable();
                vProvide(injectable.__vInjectionId, instance);
                return instance;
            };
        }
    };
}

export interface InjectableMeta {
    providedIn?: 'root';
}

// From type-fest
// https://github.com/sindresorhus/type-fest/blob/81a05404c6c60583ff3dfcc0e4b992c62e052626/source/basic.d.ts#L6-L9
type Class<T, Arguments extends unknown[] = any[]> = {
    prototype: Pick<T, keyof T>;
    new (...arguments_: Arguments): T;
};

export function inject<T>(injectable: Class<T>): T {
    if (!(INJECTION_ID in injectable)) {
        // Fallback to vue
        return vInject(injectable as any) as T;
    }
    if ('__vInit' in injectable && typeof injectable.__vInit === 'function') {
        const injectableClass = injectable as InjectableClass;
        return vInject(injectableClass.__vInjectionId, injectableClass.__vInit, true) as T;
    }
    return vInject(injectable.__vInjectionId as symbol) as T;
}

export function provide<T>(injectable: Class<T>): T {
    if (!(INJECTION_ID in injectable)) {
        // Fallback to vue
        vProvide(injectable as any, injectable);
        return inject(injectable);
    }
    if ('__vInit' in injectable && typeof injectable.__vInit === 'function') {
        const context = getCurrentInstance();
        return injectable.__vInit(context);
    }
    return inject(injectable);
}
