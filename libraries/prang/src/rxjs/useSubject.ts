import { onScopeDispose, watch } from '@vue/reactivity';
import type { UseSubjectOptions } from '@vueuse/rxjs';
import { BehaviorSubject, type Subject } from 'rxjs';
import { signal, type Signal } from '..';

export function useSubject<H>(subject: BehaviorSubject<H>, options?: UseSubjectOptions): Signal<H>;
export function useSubject<H>(subject: Subject<H>, options?: UseSubjectOptions): Signal<H | undefined>;
export function useSubject<H>(subject: Subject<H>, options?: UseSubjectOptions) {
    const value = signal(
        subject instanceof BehaviorSubject ? subject.value : undefined
    ) as typeof subject extends BehaviorSubject<H> ? Signal<H> : Signal<H | undefined>;

    const subscription = subject.subscribe({
        next(val) {
            value.set(val);
        },
        error: options?.onError
    });

    watch(value, (nextValue) => {
        subject.next(nextValue);
    });

    onScopeDispose(() => {
        subscription.unsubscribe();
    }, true);

    return value;
}
