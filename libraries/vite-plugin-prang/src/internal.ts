import type { SourceLocation } from '@babel/types';
import { BindingTypes, type BindingMetadata } from '@vue/compiler-core';
import type { ImportBinding } from 'ast-kit';

//@ts-ignore Not included in base @vue/compiler-core
BindingTypes.SETUP_SIGNAL = 'setup-signal';

export enum ClassType {
    COMPONENT,
    PIPE,
    MODULE,
    UNKNOWN
}

export interface ComponentImportBinding extends ImportBinding {
    type: ClassType;
    scopeId?: string;
}

export type ClassMeta = ComponentMeta | PipeMeta | ModuleMeta;

export interface ComponentMeta {
    type: ClassType.COMPONENT;
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
    imports?: ComponentImportBinding[];
    preamble: string;
    bindings: BindingMetadata;
}

export interface PipeMeta {
    type: ClassType.PIPE;
    name: string;
    sourceId: string;
    className: string;
}

export interface ModuleMeta {
    type: ClassType.MODULE;
    sourceId: string;
    className: string;
    imports: ComponentImportBinding[];
}

export type ComponentMetaMap = Map<string, ComponentMeta>;

export const ClassMetaMap: Map<string, ClassMeta> = new Map<string, ClassMeta>();
