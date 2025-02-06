import type { SourceLocation } from '@babel/types';
import { BindingTypes } from '@vue/compiler-core';
import type { ImportBinding } from 'ast-kit';

//@ts-ignore
BindingTypes.SETUP_SIGNAL = 'setup-signal'

export type BindingMetadata = {
    [key: string]: BindingTypes | undefined;
} & {
    __isScriptSetup?: boolean;
    __propsAliases?: Record<string, string>;
};

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
    bindings: BindingMetadata;
}

export const ComponentMap = new Map<string, ComponentMeta>();
