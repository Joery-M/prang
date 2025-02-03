import type { MaybeRef, Ref, WatchOptions } from '@vue/reactivity';
import { from as vuFrom, fromEvent as vuFromEvent } from '@vueuse/rxjs';
import type { Observable, ObservableInput } from 'rxjs';
import { ifSignalToRef } from '../internal';
import type { ReadonlySignal } from '../signal';

export function from<T>(
    signal: ReadonlySignal<T> | ObservableInput<T> | Ref<T>,
    options?: WatchOptions
): Observable<T> {
    return vuFrom(ifSignalToRef(signal), options);
}

export function fromEvent<T extends HTMLElement>(
    signal: ReadonlySignal<T> | MaybeRef<T>,
    event: string
): Observable<Event> {
    return vuFromEvent(ifSignalToRef(signal), event);
}
