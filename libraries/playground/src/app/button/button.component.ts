import { Component, signal } from '@prang/core';

@Component({
    selector: 'button-component',
    template: `<button @click="increment()">Clicked {{ counter() }} {{ counter() === 1 ? 'time' : 'times' }}</button>`
})
export default class ButtonComponent {
    counter = signal(0);

    increment() {
        this.counter.update((v) => v + 1);
    }
}
