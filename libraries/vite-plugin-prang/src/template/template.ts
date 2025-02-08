import {
    generate,
    getBaseTransformPreset,
    transform,
    transformExpression as vTransformExpression
} from '@vue/compiler-core';
import MagicString from 'magic-string';
import { basename } from 'pathe';
import { type SourceMapInput } from 'rollup';
import { dedent, stry, type ComponentQuery } from '../utils';
import { baseParse } from './parser/parse';
import { importedComponentTransform } from './transforms/importedComponent';
import { thisCallTransform } from './transforms/thisCall';
import { transformExpression } from './transforms/transformExpression';
import { transformPipe } from './transforms/transformPipe';
import { transformModel } from './transforms/vModel';

export function compileTemplate(code: string, { request, meta }: ComponentQuery, inline: boolean, useHMR: boolean) {
    const filename = basename(request.filename);
    const scopeId = request.query.scopeId!;

    // Always required
    const prefixIdentifiers = true;

    const [nodeTransforms, directiveTransforms] = getBaseTransformPreset(prefixIdentifiers);
    const expIndex = nodeTransforms.indexOf(vTransformExpression);
    nodeTransforms[expIndex] = transformExpression;

    const parsed = baseParse(code, {
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
