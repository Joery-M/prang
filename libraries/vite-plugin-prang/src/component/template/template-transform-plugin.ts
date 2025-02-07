import {
    generate,
    getBaseTransformPreset,
    transform,
    transformExpression as vTransformExpression
} from '@vue/compiler-core';
import MagicString from 'magic-string';
import { basename } from 'pathe';
import { type SourceMapInput } from 'rollup';
import { type Plugin } from 'vite';
import { ComponentMap } from '../../internal';
import { dedent, parseTemplateRequest, stry } from '../../utils';
import { baseParse } from './parser/parse';
import { importedComponentTransform } from './transforms/importedComponent';
import { thisCallTransform } from './transforms/thisCall';
import { transformExpression } from './transforms/transformExpression';
import { transformPipe } from './transforms/transformPipe';
import { transformModel } from './transforms/vModel';

export function TemplateTransformPlugin(): Plugin {
    return {
        name: 'prang:template-transform',
        resolveId(id) {
            const req = parseTemplateRequest(id);
            if (req?.query.prang && (req.query.type === 'inline-template' || req.query.type === 'template')) {
                return id;
            }
        },
        load(id) {
            const request = parseTemplateRequest(id);
            if (!request?.query.prang || request.query.type !== 'inline-template' || !request.query.scopeId) return;
            const meta = ComponentMap.get(request.query.scopeId);

            const templateString = meta?.template?.source ?? '';
            const useHMR = this.environment.mode == 'dev' && this.environment.config.server.hmr !== false;
            const result = compileTemplate(templateString, request.filename, request.query.scopeId, false, useHMR);

            return result;
        },
        transform(code, id) {
            const request = parseTemplateRequest(id);
            if (!request?.query.prang || request.query.type !== 'template') return;
            const useHMR = this.environment.mode == 'dev' && this.environment.config.server.hmr !== false;
            const result = compileTemplate(code, request.filename, request.query.scopeId!, false, useHMR);

            return result;
        }
    };
}

export function compileTemplate(code: string, path: string, scopeId: string, inline: boolean, useHMR: boolean) {
    const filename = basename(path);

    const meta = ComponentMap.get(scopeId);

    // Always required
    const prefixIdentifiers = true;

    const [nodeTransforms, directiveTransforms] = getBaseTransformPreset(prefixIdentifiers);
    const expIndex = nodeTransforms.indexOf(vTransformExpression);
    nodeTransforms[expIndex] = transformExpression;

    const parsed = baseParse(code, {
        parseMode: 'base',
        prefixIdentifiers
    });

    transform(parsed, {
        inline: false,
        hoistStatic: true,
        cacheHandlers: false,
        slotted: true,
        hmr: useHMR,
        bindingMetadata: meta?.bindings,
        prefixIdentifiers,
        directiveTransforms: Object.assign({}, directiveTransforms, { model: transformModel }),
        scopeId,
        nodeTransforms: [transformPipe, ...nodeTransforms, importedComponentTransform(meta), thisCallTransform]
    });
    const result = generate(parsed, {
        filename,
        sourceMap: true,
        mode: 'module',
        prefixIdentifiers,
        bindingMetadata: meta?.bindings,
        inline,
        runtimeModuleName: 'prang/runtime',
        scopeId
    });

    const s = new MagicString(result.code);

    if (meta?.bindings) {
        s.append(
            '\n\n/**\n * Analyzed bindings:\n' +
                JSON.stringify(meta?.bindings, undefined, 2).replace(/^(.+)/gm, ' * $1') +
                '\n */\n'
        );
    }

    if (useHMR) {
        s.append(
            dedent`
            \nimport.meta.hot.on('file-changed', ({ file }) => {
                __VUE_HMR_RUNTIME__.CHANGED_FILE = file
            });
            import.meta.hot.accept(mod => {
                if (!mod) return;
                const { render: updated } = mod;
                __VUE_HMR_RUNTIME__.rerender(${stry(scopeId)}, updated);
            })
        `
        );
    }
    return {
        code: s.toString() as string,
        preamble: result.preamble as string,
        map: result.map! as SourceMapInput
    };
}
