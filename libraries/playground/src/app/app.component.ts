import { Component, computed, OnInit, signal, viewChild } from '@prang/core';
import { onBeforeUnmount } from '@prang/core/runtime';
import ButtonComponent from './button/button.component';
import { Capitalize } from './capitalize.pipe';
import DisplayComponent from './display/display.component';
import { FormattedNumber } from './formatted-number/formatted-number.component';

@Component({
    selector: 'app-component',
    templateUrl: './app.component.html',
    imports: [ButtonComponent, Capitalize, DisplayComponent, FormattedNumber]
})
export class AppComponent implements OnInit {
    btn1 = viewChild<ButtonComponent>('btn1');
    value = signal(0);
    text = signal(undefined);
    numberValue = signal();

    computed = computed(() => this.value() * 10);

    onInit() {
        const int = setInterval(() => {
            this.btn1()?.increment();
        }, 1000);
        onBeforeUnmount(() => {
            clearInterval(int);
        });
    }

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
