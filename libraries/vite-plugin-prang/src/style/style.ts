// Code mostly copied from:
// https://github.com/vitejs/vite-plugin-vue/blob/c15699298edbacd316e646888441f1288953ae14/packages/plugin-vue/src/style.ts

import type { RawSourceMap } from '@vue/compiler-core';
import { compileStyleAsync } from '@vue/compiler-sfc';
import { basename } from 'pathe';
import type { ExistingRawSourceMap, PluginContext, TransformPluginContext } from 'rollup';
import { formatPostcssSourceMap } from 'vite';
import { type ComponentQuery } from '../utils';

export async function compileStyle(
    code: string | undefined,
    { request, meta }: ComponentQuery,
    ctx: PluginContext | TransformPluginContext
): Promise<
    | {
          code: string;
          map: ExistingRawSourceMap;
      }
    | undefined
> {
    const filename = basename(request.filename);
    const scopeId = request.query.scopeId!;
    const currentStyle = meta.styles![request.query.styleIndex!];
    const loc = currentStyle.loc;
    if (code == null) {
        code = currentStyle.code;
    }

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

    const map: ExistingRawSourceMap = result.map
        ? await formatPostcssSourceMap(
              // version property of result.map is declared as string
              // but actually it is a number
              result.map as Omit<RawSourceMap, 'version'> as ExistingRawSourceMap,
              filename
          )
        : { mappings: '', names: [], sources: [], version: 3 };
    return { code: result.code, map };
}
