import { Component, inject, provide } from '@prang/core';
import { Shopping2Service } from './shopping-2.service';
import { ShoppingItemComponent } from './shopping-item/shopping-item.component';
import { ShoppingListService } from './shopping.service';

@Component({
    selector: 'shopping-list',
    templateUrl: './shopping-list.component.html',
    imports: [ShoppingItemComponent]
})
export class ShoppingListComponent {
    // ID is here to stop the radios from colliding
    formId = crypto.randomUUID().split('-')[0];
    protected shoppingListService = inject(ShoppingListService);
    protected shopping2Service = provide(Shopping2Service);
}
