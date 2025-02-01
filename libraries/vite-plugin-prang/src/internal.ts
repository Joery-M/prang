import type { ImportBinding } from 'ast-kit';

export interface ComponentMeta {
    sourceId: string;
    span: {
        start: number;
        end: number;
    };
    selectors?: string[];
    className?: string;
    template?: string;
    inlineTemplate?: boolean;
    styles?: string[];
    imports?: ImportBinding[];
}

export const ComponentMap = new Map<string, ComponentMeta>();
