import { NOOP } from '@vue/shared';
import { type AnyClassImport } from '../internal';

export function Component(_m: ComponentMeta): Function {
    return NOOP;
}

export interface ComponentMeta {
    selector?: string | string[];
    templateUrl?: string;
    template?: string;
    styleUrls?: string[];
    styles?: string[];
    imports?: readonly AnyClassImport[];
    providers?: readonly any[];
}
