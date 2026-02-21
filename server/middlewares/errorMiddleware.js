import log from '../utils/logger.js';
import safeSendResponse from '../utils/safeSendResponse.js';

export function errorTracker(req, res, next) {
    req.connectionAborted = false;
    req.connectionTimeout = false;

    log.info(`Request: ${req.reqCtx}`);

    res.on('close', () => {
        if (!res.writableFinished) {
            req.connectionAborted = true; 
            log.warn(`${req.reqCtx} - Соединение было прервано клиентом`);
        }
    });

    req.on('error', (err) => {
        if (req.connectionAborted) return;
        log.error(`${req.reqCtx} - Ошибка запроса: ${err.message}`);
    });

    res.on('error', (err) => {
        if (req.connectionAborted) return;
        log.error(`${req.reqCtx} - Ошибка ответа: ${err.message}`);
    });
    
    next();
};

export function globalErrorHandler(err, req, res, next) {
    if (err.isTimeoutAbort) return;

    const statusCode = err.statusCode || 500;
    const isServerError = statusCode >= 500;
    const reqCtxStatus = `${req.reqCtx} - Status: ${statusCode}`;

    if (isServerError) {
        log.error(`${reqCtxStatus} - Ошибка сервера:`, err);
    } else {
        const errorDescription = statusCode === 408 ? 'Таймаут запроса' : 'Ошибка клиента';
        log.warn(`${reqCtxStatus} - ${errorDescription}: ${err.message}`);
    }

    const errorMessage = err.message || (isServerError ? 'Ошибка сервера!' : 'Ошибка запроса!');
    safeSendResponse(res, statusCode, { message: errorMessage });
};
