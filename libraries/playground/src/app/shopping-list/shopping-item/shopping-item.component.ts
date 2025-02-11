import { Component, inject } from 'prang';
import { Capitalize } from '../../capitalize.pipe';
import { Shopping2Service } from '../shopping-2.service';
import { ShoppingListService } from '../shopping.service';

@Component({
    selector: 'shopping-item-component',
    template: `
        <p>Item selected: {{ shopping2Service.selected().name | capitalizePipe }}</p>
        <p>Price: {{ shopping2Service.selected().price }}</p>
    `,
    imports: [Capitalize]
})
export class ShoppingItemComponent {
    shopping2Service = inject(Shopping2Service);
    shoppingListService = inject(ShoppingListService);
}
