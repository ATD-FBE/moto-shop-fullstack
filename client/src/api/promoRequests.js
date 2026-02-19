import apiFetch from './core/apiFetch.js';
import apiResponse from './core/apiResponse.js';

const PROMO_TIMEOUT = 25000;

/// Загрузка всех акций ///
export const sendPromoListRequest = (isAuthenticated, urlParams) => async (dispatch) => {
    const queryString = urlParams ? `?${urlParams}` : ''
    const url = `/api/promos${queryString}`;
    const options = { method: 'GET' };
    const errorPrefix = 'Не удалось загрузить акции';
    const config = {
        authRequired: isAuthenticated,
        timeout: PROMO_TIMEOUT,
        minDelay: 500,
        errorPrefix
    };

    const response = await dispatch(apiFetch(url, options, config));
    return await apiResponse(response, { errorPrefix });
};

/// Загрузка отдельной акции для редактирования ///
export const sendPromoRequest = (promoId) => async (dispatch) => {
    const url = `/api/promos/${promoId}`;
    const options = { method: 'GET' };
    const errorPrefix = 'Не удалось загрузить акцию';
    const config = {
        authRequired: true,
        timeout: PROMO_TIMEOUT,
        minDelay: 500,
        errorPrefix
    };

    const response = await dispatch(apiFetch(url, options, config));
    return await apiResponse(response, { errorPrefix });
};

/// Создание акции ///
export const sendPromoCreateRequest = (formData) => async (dispatch) => {
    const url = '/api/promos';
    const options = {
        method: 'POST',
        body: formData // Заголовки для объекта FormData устанавливаются автоматически браузером
    };
    const errorPrefix = 'Не удалось создать акцию';
    const config = {
        authRequired: true,
        timeout: PROMO_TIMEOUT,
        minDelay: 750,
        errorPrefix
    };

    const response = await dispatch(apiFetch(url, options, config));
    return await apiResponse(response, { errorPrefix });
};

/// Изменение акции ///
export const sendPromoUpdateRequest = (promoId, formData) => async (dispatch) => {
    const url = `/api/promos/${promoId}`;
    const options = {
        method: 'PUT',
        body: formData // Заголовки для объекта FormData устанавливаются автоматически браузером
    };
    const errorPrefix = 'Не удалось изменить акцию';
    const config = {
        authRequired: true,
        timeout: PROMO_TIMEOUT,
        minDelay: 750,
        errorPrefix
    };

    const response = await dispatch(apiFetch(url, options, config));
    return await apiResponse(response, { errorPrefix });
};

/// Удаление акции ///
export const sendPromoDeleteRequest = (promoId) => async (dispatch) => {
    const url = `/api/promos/${promoId}`;
    const options = { method: 'DELETE' };
    const errorPrefix = 'Не удалось удалить акцию';
    const config = {
        authRequired: true,
        timeout: PROMO_TIMEOUT,
        minDelay: 500,
        errorPrefix
    };

    const response = await dispatch(apiFetch(url, options, config));
    return await apiResponse(response, { errorPrefix });
};
