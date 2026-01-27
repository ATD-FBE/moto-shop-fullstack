import log from '../utils/logger.js';
import safeSendResponse from '../utils/safeSendResponse.js';

export function errorTracker(req, res, next) {
    req.connectionAborted = false;
    req.connectionTimeout = false;

    log.info(`Request: ${req.logCtx}`);

    req.on('aborted', () => {
        log.warn(`${req.logCtx} - Соединение было прервано клиентом`);
        req.connectionAborted = true;
    });

    req.on('error', (err) => {
        if (req.connectionAborted) return;
        log.error(`${req.logCtx} - Ошибка запроса: ${err.message}`);
    });

    res.on('error', (err) => {
        if (req.connectionAborted) return;
        log.error(`${req.logCtx} - Ошибка ответа: ${err.message}`);
    });
    
    next();
};

export function globalErrorHandler(err, req, res, next) {
    const statusCode = err.statusCode || 500;
    const isServerError = statusCode >= 500;
    const errorMessage = err.message || (isServerError ? 'Ошибка сервера!' : 'Ошибка запроса!');
    const requestContext = `${req.logCtx} Status: ${statusCode}`;

    if (isServerError) {
        log.error(`${requestContext} - Ошибка сервера:\n${err.stack}`);
    } else {
        const errorDescription = statusCode === 408 ? 'Таймаут запроса' : 'Ошибка клиента';
        log.warn(`${requestContext} - ${errorDescription}: ${err.message}`);
    }

    safeSendResponse(req, res, statusCode, { message: errorMessage });
};
