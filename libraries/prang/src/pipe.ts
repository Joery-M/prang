import { camelCase } from 'scule';
import { PIPE, type ClassPipe } from './internal';

export function Pipe(meta: PipeMeta = {}): Function {
    return (component: ClassPipe) => {
        component.__vType = PIPE;
        component.__vSelector = meta.name ?? camelCase(component.name);
    };
}

export interface PipeMeta {
    name?: string;
}
