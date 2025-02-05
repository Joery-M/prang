import { Injectable, signal } from '@prang/core';
import { ShoppingItem } from './shopping.model';

@Injectable()
export class Shopping2Service {
    selected = signal<ShoppingItem>();
}
