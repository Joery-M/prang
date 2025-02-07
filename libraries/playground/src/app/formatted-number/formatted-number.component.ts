import { Component, model } from 'prang';
import { Capitalize } from '../capitalize.pipe';

@Component({
    selector: 'formatted-number',
    templateUrl: './formatted-number.component.html',
    styleUrls: ['./formatted-number.component.css'],
    imports: [Capitalize]
})
export class FormattedNumber {
    value = model(2);
    test = 'asdf';
}
