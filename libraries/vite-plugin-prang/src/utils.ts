import crypto from 'node:crypto';

export function parseTemplateRequest(id: string): {
    filename: string;
    query: TemplateQuery;
} {
    const [filename, rawQuery] = id.split(`?`, 2);
    const query = Object.fromEntries(new URLSearchParams(rawQuery)) as TemplateQuery;
    if (query.prang != null) {
        query.prang = true;
    }
    if (query.classIndex != null) {
        query.classIndex = 0;
    }
    if (query.inline != null) {
        query.inline = true;
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

interface TemplateQuery {
    scopeId?: string;
    classIndex?: number;
    prang?: boolean;
    inline?: boolean;
}
