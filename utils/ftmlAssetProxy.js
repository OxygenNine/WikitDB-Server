const ALLOWED_HOSTS = ['wikidot.com', 'wdfiles.com', 'd3g0gp89917ko0.cloudfront.net'];

function isAllowedFtmlAssetUrl(raw) {
    try {
        const url = new URL(raw);
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return false;
        const host = url.hostname.toLowerCase();
        return ALLOWED_HOSTS.some(allowed => host === allowed || host.endsWith(`.${allowed}`));
    } catch {
        return false;
    }
}

function proxyHref(raw) {
    return `/api/tools/ftml-asset?url=${encodeURIComponent(raw)}`;
}

function rewriteFtmlCss(css, baseUrl) {
    const base = new URL(baseUrl);
    const rewrite = (raw) => {
        const value = String(raw || '').trim();
        if (!value || /^(?:data:|blob:|javascript:|mailto:|tel:|#|var\()/i.test(value)) return value;
        try {
            const absolute = new URL(value, base).href;
            return isAllowedFtmlAssetUrl(absolute) ? proxyHref(absolute) : absolute;
        } catch {
            return value;
        }
    };
    return String(css || '')
        .replace(/url\(\s*(["']?)([^"')]+)\1\s*\)/gi, (_match, quote, raw) => `url(${quote}${rewrite(raw)}${quote})`)
        .replace(/@import\s+url\(\s*(["']?)([^"')]+)\1\s*\)/gi, (_match, quote, raw) => `@import url(${quote}${rewrite(raw)}${quote})`)
        .replace(/@import\s+(["'])([^"']+)\1/gi, (_match, quote, raw) => `@import ${quote}${rewrite(raw)}${quote}`);
}

module.exports = { isAllowedFtmlAssetUrl, rewriteFtmlCss };
