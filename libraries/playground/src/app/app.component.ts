import { Component, computed, signal } from '@prang/core';
import ButtonComponent from './button/button.component';
import { Capitalize } from './capitalize.pipe';

@Component({
    selector: 'app-component',
    templateUrl: './app.component.html',
    imports: [ButtonComponent, Capitalize]
})
export class AppComponent {
    value = signal(0);
    text = signal('test');

    computed = computed(() => this.value() * 10);

    increment() {
        this.value.update((v) => v + 1);
    }
}
