import { Component, input } from '@prang/core';

@Component({
    selector: 'display-text',
    template: ` <p>{{ value() }}</p> `
})
export default class {
    value = input<string>();
}
