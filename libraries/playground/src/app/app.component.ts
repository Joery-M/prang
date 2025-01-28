import { Component, computed, signal } from '@prang/core';
import './capitalize.pipe';
import ButtonComponent from './button/button.component';

@Component({
    selector: 'app-component',
    templateUrl: './app.component.html',
    imports: [ButtonComponent]
})
export class AppComponent {
    value = signal(0);

    computed = computed(() => this.value() * 10);

    increment() {
        this.value.update((v) => v + 1);
    }
}
