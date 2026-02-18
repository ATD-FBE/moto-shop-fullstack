import log from '../utils/logger.js';
import safeSendResponse from '../utils/safeSendResponse.js';
import { SERVER_CONSTANTS } from '../../shared/constants.js';

const { ERROR_SIGNALS } = SERVER_CONSTANTS;

export function errorTracker(req, res, next) {
    req.connectionAborted = false;
    req.connectionTimeout = false;

    log.info(`Request: ${req.reqCtx}`);

    req.on('aborted', () => {
        log.warn(`${req.reqCtx} - Соединение было прервано клиентом`);
        req.connectionAborted = true;
    });

    /*req.on('close', () => {
        if (res.writableFinished) return; // Запрос успешно завершён
        log.warn(`${req.reqCtx} - Соединение было прервано`);
        req.connectionClosed = true;
    });*/

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
    safeSendResponse(req, res, statusCode, { message: errorMessage });
};
