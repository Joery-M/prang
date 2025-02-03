import { Component, input } from '@prang/core';

@Component({
    selector: 'display-text',
    template: ` <p>{{ value() }}</p> `,
    styles: [
        `
            p {
                font-size: 25px;
                font-weight: bold;
                font-family: cursive;
            }
        `
    ]
})
export default class {
    value = input<string>('nothing');
}
