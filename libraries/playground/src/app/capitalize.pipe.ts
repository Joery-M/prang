import { Pipe } from '@prang/core';

@Pipe()
export class Capitalize {
    transform(value: string) {
        return value.slice(0, 1).toUpperCase() + value.slice(1).toLowerCase();
    }
}
