import apiFetch from './core/apiFetch.js';
import apiResponse from './core/apiResponse.js';

/// Генерация и загрузка реквизитов магазина в pdf ///
export const sendCompanyDetailsPdfRequest = () => async (dispatch) => {
    const url = '/api/company/details/pdf';
    const options = { method: 'GET' };
    const errorPrefix = 'Не удалось загрузить реквизиты магазина';
    const config = {
        authRequired: false,
        timeout: 10000,
        minDelay: 0,
        errorPrefix
    };

    const response = await dispatch(apiFetch(url, options, config));
    return await apiResponse(response, { errorPrefix, asFile: true });
};
