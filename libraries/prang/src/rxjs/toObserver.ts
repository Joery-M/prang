import type { Ref } from '@vue/reactivity';
import { toObserver as vuToObserver } from '@vueuse/rxjs';
import type { NextObserver } from 'rxjs';
import { ifSignalToRef } from '../internal';
import type { ReadonlySignal } from '../signal';

export function toObserver<T>(signal: ReadonlySignal<T> | Ref<T>): NextObserver<T> {
    return vuToObserver(ifSignalToRef(signal));
}
