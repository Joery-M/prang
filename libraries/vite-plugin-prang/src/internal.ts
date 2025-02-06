import type { SourceLocation } from '@babel/types';
import type { ImportBinding } from 'ast-kit';

export interface ComponentMeta {
    sourceId: string;
    className: string;
    selectors?: string[];
    template?: { loc: SourceLocation; source: string };
    inlineTemplate?: boolean;
    /**
     * Inline styles
     */
    styles?: {
        loc: SourceLocation;
        code: string;
    }[];
    imports?: ImportBinding[];
    deleteLocs: SourceLocation[];
    preamble: string;
}

export const ComponentMap = new Map<string, ComponentMeta>();
