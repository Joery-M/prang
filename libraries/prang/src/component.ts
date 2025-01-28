export function Component(meta: ComponentMeta): Function {
    return Function();
}

export interface ComponentMeta {
    selector?: string;
    templateUrl?: string;
    template?: string;
    styleUrls?: string[];
    styles?: string[];
    imports?: readonly any[];
    providers?: readonly any[];
}
