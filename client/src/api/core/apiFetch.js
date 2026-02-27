import { incrementApiRequests, decrementApiRequests } from '@/redux/slices/loadingSlice.js';
import { addApiController, removeApiController } from '@/services/apiControllerService.js';
import { logRequestStatus } from '@/helpers/requestLogger.js';
import { sendAuthRefreshRequest } from '../authRequests.js';
import waitForRequestDelay from '@/helpers/waitForRequestDelay.js';
import { handleLogout } from '@/services/authService.js';
import { CLIENT_CONSTANTS, NETWORK_FAIL_STATUS_CODE } from '@shared/constants.js';

const { PROD_ENV, REQUEST_STATUS } = CLIENT_CONSTANTS;

const defaultConfig = {
    authRequired: true,
    skipRefreshTokenCheck: false,
    timeout: 10000,
    minDelay: 0,
    errorPrefix: ''
};

const createUnauthorizedResponse = (
    status = 401,
    message = 'Токены доступа и обновления недействительны'
) => {
    const body = JSON.stringify({
        message,
        reason: status === 410 ? REQUEST_STATUS.USER_GONE : REQUEST_STATUS.UNAUTH
    });

    return new Response(body, {
        status,
        statusText: status === 410 ? 'Gone' : 'Unauthorized',
        headers: { 'Content-Type': 'application/json' }
    });
};

const apiFetch = (url, options, config) => async (dispatch, getState) => {
    const isLocalSession = getState().auth.isLocalSession;
    
    const finalConfig = { ...defaultConfig, ...config };
    const { authRequired, skipRefreshTokenCheck, timeout, minDelay, errorPrefix } = finalConfig;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort('timeout'), timeout);
    const requestTimestamp = Date.now();

    dispatch(incrementApiRequests());
    addApiController(controller);

    try {
        if (isLocalSession && authRequired) {
            throw new Error('Запрос отклонён: запрещено в локальной сессии');
        }

        const response = await fetch(url, {
            credentials: 'include',
            signal: controller.signal,
            ...options
        });

        if (!authRequired) return response;

        const LOG_CTX = 'AUTH: REQUEST CHECK';

        // Обновление токена доступа, если недействителен, и повторный вызов запроса при его обновлении
        if (response.status === 401) {
            if (!PROD_ENV) {
                const { message } = await response.clone().json();
                logRequestStatus({ context: LOG_CTX, status: REQUEST_STATUS.UNAUTH, message });
            }

            // Проверка токена обновления в клиенте
            if (!skipRefreshTokenCheck) {
                const refreshTokenExpiresAt = getState().auth.refreshTokenExpiresAt;
                const isRefreshTokenValid = new Date() < refreshTokenExpiresAt;
    
                if (!isRefreshTokenValid) {
                    logRequestStatus({
                        context: LOG_CTX,
                        status: REQUEST_STATUS.UNAUTH,
                        message: 'Срок действия токена обновления истёк'
                    });
    
                    await dispatch(handleLogout({ forceRedirectToLogin: true }));
                    return createUnauthorizedResponse(response.status);
                }
            }

            // Обновление токена доступа
            const { status, message } = await dispatch(sendAuthRefreshRequest());

            switch (status) {
                case REQUEST_STATUS.SUCCESS: {
                    logRequestStatus({ context: LOG_CTX, status, message });

                    // Повторный вызов запроса с отменённым флагом прав
                    return await dispatch(apiFetch(url, options, {
                        ...finalConfig,
                        authRequired: false
                    }));
                }

                case REQUEST_STATUS.UNAUTH: {
                    logRequestStatus({ context: LOG_CTX, status, message });
                    await dispatch(handleLogout({ forceRedirectToLogin: true }));
                    return createUnauthorizedResponse(response.status);
                }

                case REQUEST_STATUS.ERROR:
                    throw new Error(message);

                default:
                    logRequestStatus({ context: LOG_CTX, status, message, unhandled: true });
                    throw new Error(message || '<нет сообщения>');
            }
        }

        if (response.status === 410) {
            if (!PROD_ENV) {
                const { message } = await response.clone().json();
                logRequestStatus({ context: LOG_CTX, status: REQUEST_STATUS.USER_GONE, message });
            }

            await dispatch(handleLogout({ forceRedirectToLogin: true }));
            return createUnauthorizedResponse(response.status);
        }

        return response;
    } catch (err) {
        const reason = err === 'timeout' || err === 'manualAbort'
            ? err
            : (controller.signal.reason || null);
        const isAbortError = err.name === 'AbortError' || err === 'timeout' || err === 'manualAbort';

        const isTimeout = reason === 'timeout';
        const isAborted = isAbortError && !isTimeout;

        const errorMessage = isTimeout
            ? 'Время ожидания запроса истекло'
            : isAborted
                ? 'Запрос отменен'
                : (err instanceof Error ? err.message : String(err) || 'Ошибка запроса');

        const statusCode = isTimeout ? NETWORK_FAIL_STATUS_CODE : isAborted ? 499 : 500;

        const statusText = isTimeout
            ? 'Request Timeout'
            : isAborted
                ? 'Request Aborted'
                : 'Internal Error';

        const body = JSON.stringify({
            message: `${errorPrefix ? errorPrefix + ': ' : ''}${errorMessage}`,
            ...(isTimeout && { reason: REQUEST_STATUS.TIMEOUT })
        });

        return new Response(body, {
            status: statusCode,
            statusText,
            headers: { 'Content-Type': 'application/json' }
        });
    } finally {
        clearTimeout(timeoutId);

        await waitForRequestDelay(requestTimestamp, minDelay, controller.signal);

        dispatch(decrementApiRequests());
        removeApiController(controller);
    }
};

export default apiFetch;
