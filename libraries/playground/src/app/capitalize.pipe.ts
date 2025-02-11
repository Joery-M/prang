import { Pipe } from 'prang';

@Pipe({
    name: 'capitalizePipe'
})
export class Capitalize {
    transform(value: string, lowerRest: boolean = false) {
        if (value == null) return '';
        return value.slice(0, 1).toUpperCase() + (lowerRest ? value.slice(1).toLowerCase() : value.slice(1));
    }
}
