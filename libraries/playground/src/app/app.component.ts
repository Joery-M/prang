import { Component, computed, signal } from '@prang/core';
import ButtonComponent from './button/button.component';
import DisplayComponent from './display/display.component';
import { Capitalize } from './capitalize.pipe';

@Component({
    selector: 'app-component',
    templateUrl: './app.component.html',
    imports: [ButtonComponent, Capitalize, DisplayComponent]
})
export class AppComponent {
    value = signal(0);
    text = signal('test');

    computed = computed(() => this.value() * 10);

    increment() {
        this.value.update((v) => v + 1);
    }

    addA(value: string) {
        return value + 'A';
    }

    currency(value: number) {
        return Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(value);
    }
}
