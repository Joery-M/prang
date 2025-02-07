import { Injectable, signal } from 'prang';
import { ShoppingItem } from './shopping.model';
import { faker } from '@faker-js/faker';

@Injectable({ providedIn: 'root' })
export class ShoppingListService {
    shoppingList = signal<ShoppingItem[]>([]);

    constructor() {
        const list = new Array(3).fill(undefined).map(() => {
            return {
                name: faker.food.fruit(),
                price: faker.commerce.price({ max: 5, symbol: '€' })
            };
        });
        this.shoppingList.set(list);
    }
}
