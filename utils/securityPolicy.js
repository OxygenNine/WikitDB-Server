function normalizeOrigin(value) {
    if (!value || typeof value !== 'string') return null;
    try {
        return new URL(value).origin;
    } catch {
        return null;
    }
}

function parseAllowedOrigins(siteOrigin, nodeEnv = 'development') {
    const origins = new Set();

    if (nodeEnv !== 'production') {
        origins.add('http://localhost:3000');
        origins.add('http://localhost:3001');
    }

    for (const value of String(siteOrigin || '').split(',')) {
        const origin = normalizeOrigin(value.trim());
        if (origin) origins.add(origin);
    }

    return origins;
}

function isOriginAllowed({ method, origin, referer }, allowedOrigins) {
    if (['GET', 'HEAD', 'OPTIONS'].includes(String(method || '').toUpperCase())) {
        return true;
    }

    const requestOrigin = normalizeOrigin(origin);
    if (requestOrigin) return allowedOrigins.has(requestOrigin);

    const refererOrigin = normalizeOrigin(referer);
    if (refererOrigin) return allowedOrigins.has(refererOrigin);

    return false;
}

function hasDistinctAllowedStrings(values, expectedCount, allowedValues) {
    if (!Array.isArray(values) || values.length !== expectedCount) return false;
    if (!values.every(value => typeof value === 'string')) return false;
    if (new Set(values).size !== expectedCount) return false;

    const allowed = new Set(allowedValues);
    return values.every(value => allowed.has(value));
}

function normalizeAccountName(value) {
    return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function isArticleOwnedBy(articleAuthor, wikidotAccount) {
    const expected = normalizeAccountName(wikidotAccount);
    if (!expected) return false;

    if (Array.isArray(articleAuthor)) {
        return articleAuthor.some(author => normalizeAccountName(author) === expected);
    }

    return normalizeAccountName(articleAuthor) === expected;
}

module.exports = {
    hasDistinctAllowedStrings,
    isArticleOwnedBy,
    isOriginAllowed,
    normalizeOrigin,
    parseAllowedOrigins,
};
