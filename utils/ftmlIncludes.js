const MAX_PAGE_NAME_LENGTH = 200;

function isSafePageName(value) {
    return typeof value === 'string'
        && value.length > 0
        && value.length <= MAX_PAGE_NAME_LENGTH
        && !/[\u0000-\u001f\u007f/?#\\@]/.test(value)
        && !value.includes('..');
}

function parseIncludeDirective(value) {
    const parts = String(value || '').split('|');
    const page = (parts.shift() || '').trim();
    const variables = {};

    for (const part of parts) {
        const separator = part.indexOf('=');
        if (separator <= 0) continue;
        const key = part.slice(0, separator).trim();
        const variableValue = part.slice(separator + 1).trim();
        if (/^[A-Za-z0-9_-]{1,64}$/.test(key)) {
            variables[key] = variableValue.slice(0, 10000);
        }
    }

    return { page, variables };
}

function substituteVariables(source, variables) {
    return String(source || '').replace(/\{\$([A-Za-z0-9_-]{1,64})\}/g, (match, key) => (
        Object.prototype.hasOwnProperty.call(variables, key) ? variables[key] : match
    ));
}

function resolveIncludeTarget(page, currentSite, sites) {
    let site = currentSite;
    let pageName = page;

    if (page.startsWith(':')) {
        const match = page.match(/^:([^:]+):(.+)$/);
        if (!match) return null;
        const requestedSite = match[1].toLowerCase();
        const siteConfig = sites.find(item => (
            String(item.PARAM).toLowerCase() === requestedSite
            || String(item.WIKIT_ID).toLowerCase() === requestedSite
        ));
        if (!siteConfig) return null;
        site = siteConfig.PARAM;
        pageName = match[2];
    }

    if (!isSafePageName(pageName)) return null;
    return { site, page: pageName.toLowerCase() };
}

module.exports = {
    isSafePageName,
    parseIncludeDirective,
    resolveIncludeTarget,
    substituteVariables,
};
