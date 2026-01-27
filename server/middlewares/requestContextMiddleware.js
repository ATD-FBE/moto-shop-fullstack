export function requestContext(req, res, next) {
    const { method, originalUrl, ip } = req;
    req.logCtx = `${method} ${originalUrl} [${ip}]`;
    next();
};
