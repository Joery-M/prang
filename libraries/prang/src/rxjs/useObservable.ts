import { onScopeDispose } from '@vue/reactivity';
import type { UseObservableOptions } from '@vueuse/rxjs';
import type { Observable } from 'rxjs';
import { type ReadonlySignal, signal } from '..';

export function useObservable<H, I = undefined>(
    observable: Observable<H>,
    options?: UseObservableOptions<I | undefined>
): ReadonlySignal<H | I> {
    const value = signal<H | I | undefined>(options?.initialValue);
    const subscription = observable.subscribe({
        next: (val) => value.set(val),
        error: options?.onError
    });
    onScopeDispose(() => {
        subscription.unsubscribe();
    }, true);
    return value as ReadonlySignal<H | I>;
}
