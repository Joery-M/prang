import { Component, model } from '@prang/core';

@Component({
    selector: 'formatted-number',
    templateUrl: './formatted-number.component.html'
})
export class FormattedNumber {
    value = model(5);
}
