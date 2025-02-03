import type { SourceLocation } from '@babel/types';
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
    /**
     * Inline styles
     */
    styles?: {
        loc: SourceLocation;
        code: string;
    }[];
    imports?: ImportBinding[];
}

export const ComponentMap = new Map<string, ComponentMeta>();
