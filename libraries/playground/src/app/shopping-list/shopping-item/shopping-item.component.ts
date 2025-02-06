import { Component, inject } from '@prang/core';
import { Shopping2Service } from '../shopping-2.service';
import { ShoppingListService } from '../shopping.service';

@Component({
    selector: 'shopping-item-component',
    template: `
        <p>Item selected: {{ shopping2Service.selected().name }}</p>
        <p>Price: {{ shopping2Service.selected().price }}</p>
    `
})
export class ShoppingItemComponent {
    shopping2Service = inject(Shopping2Service);
    shoppingListService = inject(ShoppingListService);
}
