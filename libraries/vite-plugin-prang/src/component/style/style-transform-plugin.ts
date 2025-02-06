// Code mostly copied from:
// https://github.com/vitejs/vite-plugin-vue/blob/c15699298edbacd316e646888441f1288953ae14/packages/plugin-vue/src/style.ts

import type { SourceLocation } from '@babel/types';
import type { RawSourceMap } from '@vue/compiler-core';
import { compileStyleAsync } from '@vue/compiler-sfc';
import { basename } from 'pathe';
import type { ExistingRawSourceMap, PluginContext, TransformPluginContext } from 'rollup';
import { formatPostcssSourceMap, type Plugin } from 'vite';
import { ComponentMap } from '../../internal';
import { parseTemplateRequest } from '../../utils';

export function ComponentStyleTransform(): Plugin {
    return {
        name: 'prang:component-style',
        resolveId(id) {
            const req = parseTemplateRequest(id);
            if (req?.query.prang) {
                return id;
            }
        },
        async load(id) {
            const request = parseTemplateRequest(id);
            if (
                !request?.query.prang ||
                request.query.type !== 'inline-style' ||
                !request.query.scopeId ||
                request.query.styleIndex == null
            )
                return;
            const meta = ComponentMap.get(request.query.scopeId);
            if (!meta || !meta.styles) return { code: '' };

            const currentStyle = meta.styles[request.query.styleIndex];
            if (currentStyle == null) return { code: '' };

            const filename = basename(request.filename);
            return compileStyle(currentStyle.code, filename, request.query.scopeId, this, currentStyle.loc);
        },
        async transform(code, id) {
            const request = parseTemplateRequest(id);
            if (!request?.query.prang || request.query.type !== 'style' || !request.query.scopeId) return;

            const filename = basename(request.filename);

            let loc: SourceLocation | undefined;
            const meta = ComponentMap.get(request.query.scopeId);
            if (request.query.styleIndex != null && meta?.styles?.[request.query.styleIndex]) {
                const style = meta.styles[request.query.styleIndex];
                loc = style.loc;
            }

            const result = await compileStyle(code, filename, request.query.scopeId, this, loc);
            return result;
        }
    };
}

async function compileStyle(
    code: string,
    filename: string,
    scopeId: string,
    ctx: PluginContext | TransformPluginContext,
    loc?: SourceLocation
) {
    const cssSourceMap = ctx.environment.mode !== 'dev' || ctx.environment.config.css.devSourcemap;

    const result = await compileStyleAsync({
        filename,
        id: `data-v-${scopeId}`,
        source: code,
        isProd: ctx.environment.mode !== 'dev',
        scoped: true,
        ...(cssSourceMap
            ? {
                  postcssOptions: {
                      map: {
                          from: filename,
                          inline: false,
                          annotation: false
                      }
                  }
              }
            : {})
    });

    if (result.errors.length) {
        result.errors.forEach((error: any) => {
            if (error.line && error.column) {
                error.loc = {
                    file: loc?.filename ?? filename,
                    line: error.line + (loc?.start.line ?? 0),
                    column: error.column
                };
            }
            ctx.error(error);
        });
        return;
    }

    const map = result.map
        ? await formatPostcssSourceMap(
              // version property of result.map is declared as string
              // but actually it is a number
              result.map as Omit<RawSourceMap, 'version'> as ExistingRawSourceMap,
              filename
          )
        : ({ mappings: '' } as any);
    return { code: result.code, map };
}
