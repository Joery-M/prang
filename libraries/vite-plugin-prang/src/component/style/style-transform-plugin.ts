import type { RawSourceMap } from '@vue/compiler-core';
import { compileStyleAsync } from '@vue/compiler-sfc';
import { basename } from 'pathe';
import type { ExistingRawSourceMap } from 'rollup';
import { formatPostcssSourceMap, type Plugin } from 'vite';
import { parseTemplateRequest } from '../../utils';

export function ComponentStyleTransform(): Plugin {
    return {
        name: 'prang:component-style',
        async transform(code, id, options) {
            const request = parseTemplateRequest(id);
            if (!request?.query.prang || request.query.type !== 'style' || !request.query.scopeId) return;
            // Code mostly copied from:
            // https://github.com/vitejs/vite-plugin-vue/blob/c15699298edbacd316e646888441f1288953ae14/packages/plugin-vue/src/style.ts

            const filename = basename(request.filename);
            const cssSourceMap = this.environment.mode !== 'dev' || this.environment.config.css.devSourcemap;
            const result = await compileStyleAsync({
                filename,
                id: request.query.scopeId,
                source: code,
                isProd: this.environment.mode !== 'dev',
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
                for (const error of result.errors) {
                    this.error(error);
                }
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
    };
}
