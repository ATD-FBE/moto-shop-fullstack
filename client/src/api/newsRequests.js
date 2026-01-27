import apiFetch from './core/apiFetch.js';
import apiResponse from './core/apiResponse.js';

/// Загрузка всех новостей ///
export const sendNewsListRequest = (isAuthenticated) => async (dispatch) => {
    const url = '/api/news';
    const options = { method: 'GET' };
    const errorPrefix = 'Не удалось загрузить новости';
    const config = {
        authRequired: isAuthenticated,
        timeout: 15000,
        minDelay: 500,
        errorPrefix
    };

    const response = await dispatch(apiFetch(url, options, config));
    return await apiResponse(response, { errorPrefix });
};

/// Загрузка отдельной новости для редактирования ///
export const sendNewsRequest = (newsId) => async (dispatch) => {
    const url = `/api/news/${newsId}`;
    const options = { method: 'GET' };
    const errorPrefix = 'Не удалось загрузить новость';
    const config = {
        authRequired: true,
        timeout: 10000,
        minDelay: 500,
        errorPrefix
    };

    const response = await dispatch(apiFetch(url, options, config));
    return await apiResponse(response, { errorPrefix });
};

/// Создание новости ///
export const sendNewsCreateRequest = (formFields) => async (dispatch) => {
    const url = '/api/news';
    const options = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formFields)
    };
    const errorPrefix = 'Не удалось опубликовать новость';
    const config = {
        authRequired: true,
        timeout: 10000,
        minDelay: 750,
        errorPrefix
    };

    const response = await dispatch(apiFetch(url, options, config));
    return await apiResponse(response, { errorPrefix });
};

/// Изменение новости ///
export const sendNewsUpdateRequest = (newsId, formFields) => async (dispatch) => {
    const url = `/api/news/${newsId}`;
    const options = {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formFields)
    };
    const errorPrefix = 'Не удалось изменить новость';
    const config = {
        authRequired: true,
        timeout: 10000,
        minDelay: 750,
        errorPrefix
    };

    const response = await dispatch(apiFetch(url, options, config));
    return await apiResponse(response, { errorPrefix });
};

/// Удаление новости ///
export const sendNewsDeleteRequest = (newsId) => async (dispatch) => {
    const url = `/api/news/${newsId}`;
    const options = { method: 'DELETE' };
    const errorPrefix = 'Не удалось удалить новость';
    const config = {
        authRequired: true,
        timeout: 10000,
        minDelay: 500,
        errorPrefix
    };

    const response = await dispatch(apiFetch(url, options, config));
    return await apiResponse(response, { errorPrefix });
};
