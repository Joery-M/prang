import { Pipe } from '@prang/core';

@Pipe()
export class Capitalize {
    transform(value: string, lowerRest: boolean = false) {
        return value.slice(0, 1).toUpperCase() + (lowerRest ? value.slice(1).toLowerCase() : value.slice(1));
    }
}
