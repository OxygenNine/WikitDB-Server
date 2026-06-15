const {
    isOriginAllowed,
    parseAllowedOrigins,
} = require('./securityPolicy');

export function validateOrigin(req) {
    const allowedOrigins = parseAllowedOrigins(
        process.env.SITE_ORIGIN,
        process.env.NODE_ENV
    );

    return isOriginAllowed({
        method: req.method,
        origin: req.headers.origin,
        referer: req.headers.referer,
    }, allowedOrigins);
}

export function withCsrf(handler) {
    return async (req, res) => {
        if (!validateOrigin(req)) {
            return res.status(403).json({ error: '请求来源不合法' });
        }
        return handler(req, res);
    };
}
