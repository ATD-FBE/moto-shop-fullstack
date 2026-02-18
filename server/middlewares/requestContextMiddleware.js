export function requestContext(req, res, next) {
    const { method, originalUrl, ip } = req;
    req.reqCtx = `${method} ${originalUrl} [${ip}]`;
    next();
};
