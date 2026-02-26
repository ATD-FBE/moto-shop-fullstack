import apiFetch from './core/apiFetch.js';
import apiResponse from './core/apiResponse.js';

const LOGS_TIMEOUT = 20000;

/// Загрузка логов ошибок ///
export const sendErrorLogsRequest = () => async (dispatch) => {
    const url = '/api/logs/errors';
    const options = { method: 'GET' };
    const errorPrefix = 'Не удалось загрузить логи ошибок';
    const config = {
        authRequired: true,
        timeout: LOGS_TIMEOUT,
        minDelay: 500,
        errorPrefix
    };

    const response = await dispatch(apiFetch(url, options, config));
    return await apiResponse(response, { errorPrefix });
};
