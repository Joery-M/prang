import crypto from 'node:crypto';

interface TemplateQuery {
    scopeId?: string;
    classIndex?: number;
    prang?: boolean;
    type?: 'style' | 'inline-style' | 'inline-template' | 'template';
    styleIndex?: number;
}

export function parseTemplateRequest(id: string): {
    filename: string;
    query: TemplateQuery;
} {
    const [filename, rawQuery] = id.split(`?`, 2);
    const query = Object.fromEntries(new URLSearchParams(rawQuery)) as TemplateQuery;
    if (query.prang != null) {
        query.prang = true;
    }
    if (query.styleIndex != null) {
        query.styleIndex = Number(query.styleIndex);
    }
    return {
        filename,
        query
    };
}

const hash =
    crypto.hash ??
    ((algorithm: string, data: crypto.BinaryLike, outputEncoding: crypto.BinaryToTextEncoding) =>
        crypto.createHash(algorithm).update(data).digest(outputEncoding));

export function getHash(text: string): string {
    return hash('sha256', text, 'hex').substring(0, 8);
}

export function stry(literals: string): string;
export function stry(strings: TemplateStringsArray, ...values: unknown[]): string;
export function stry(strings: TemplateStringsArray | string, ...values: unknown[]): string {
    const val = template(strings, ...values);
    return JSON.stringify(val);
}

// From: https://github.com/victornpb/tiny-dedent
export function dedent(strings: TemplateStringsArray | string, ...values: unknown[]): string {
    let str = template(strings, ...values);
    str = str.replace(/^[ \t]*\r?\n/, ''); // remove leading blank line
    var indent = /^[ \t]+/m.exec(str); // detected indent
    if (indent) str = str.replace(new RegExp('^' + indent[0], 'gm'), ''); // remove indent
    str = str.replace(/(\r?\n)[ \t]+$/, '$1');
    return str; // remove trailling blank line
}

function template(str: TemplateStringsArray | string, ...keys: any[]) {
    const strings = typeof str === 'string' ? [str] : str;

    const result = [strings[0]];
    keys.forEach((key, i) => {
        result.push(key, strings[i + 1]);
    });
    return result.join('');
}
