import { Component, model } from '@prang/core';

@Component({
    selector: 'formatted-number',
    templateUrl: './formatted-number.component.html',
    styleUrls: ['./formatted-number.component.css']
})
export class FormattedNumber {
    value = model(5);
    test = 'asdf'
}
