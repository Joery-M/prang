import { toObserver as vuToObserver } from '@vueuse/rxjs';
import type { NextObserver } from 'rxjs';
import type { Ref } from 'vue';
import type { ReadonlySignal } from '..';
import { ifSignalToRef } from '../internal';

export function toObserver<T>(signal: ReadonlySignal<T> | Ref<T>): NextObserver<T> {
    return vuToObserver(ifSignalToRef(signal));
}
