import { Component, output, signal } from '@prang/core';

@Component({
    selector: 'button-component',
    template: `<button @click="increment()">Clicked {{ counter() }} {{ counter() === 1 ? 'time' : 'times' }}</button>`,
    styleUrls: ['./button.component.css']
})
export default class ButtonComponent {
    counter = signal(0);
    incremented = output<number>();

    increment() {
        this.counter.update((v) => v + 1);
        this.incremented(this.counter());
    }
}
