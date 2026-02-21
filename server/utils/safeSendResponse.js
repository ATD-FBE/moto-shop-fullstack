const NO_BODY_STATUSES = new Set([204, 205, 304]);

export default function safeSendResponse(res, statusCode, data = {}) {
    if (res.writableEnded || res.destroyed || res.headersSent) return;

    if (NO_BODY_STATUSES.has(statusCode)) {
        return res.status(statusCode).end();
    }

    res.status(statusCode).json(data);
};
