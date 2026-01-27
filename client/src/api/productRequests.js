import apiFetch from './core/apiFetch.js';
import apiResponse from './core/apiResponse.js';

/// Загрузка списка товаров для одной страницы ///
export const sendProductListRequest = (isAuthenticated, context, urlParams) => async (dispatch) => {
    const url = `/api/catalog/products?context=${context}&${urlParams}`;
    const options = { method: 'GET' };
    const errorPrefix = 'Не удалось загрузить товары';
    const config = {
        authRequired: isAuthenticated,
        timeout: 15000,
        minDelay: 500,
        errorPrefix
    };

    const response = await dispatch(apiFetch(url, options, config));
    return await apiResponse(response, { errorPrefix });
};

/// Загрузка отдельного товара на его странице ///
export const sendProductRequest = (isAuthenticated, productId) => async (dispatch) => {
    const url = `/api/catalog/products/${productId}`;
    const options = { method: 'GET' };
    const errorPrefix = 'Не удалось загрузить товар';
    const config = {
        authRequired: isAuthenticated,
        timeout: 10000,
        minDelay: 500,
        errorPrefix
    };

    const response = await dispatch(apiFetch(url, options, config));
    return await apiResponse(response, { errorPrefix });
};

/// Создание товара ///
export const sendProductCreateRequest = (formData) => async (dispatch) => {
    const url = '/api/catalog/products';
    const options = {
        method: 'POST',
        body: formData // Заголовки для объекта FormData устанавливаются автоматически браузером
    };
    const errorPrefix = 'Не удалось создать товар';
    const config = {
        authRequired: true,
        timeout: 10000,
        minDelay: 750,
        errorPrefix
    };

    const response = await dispatch(apiFetch(url, options, config));
    return await apiResponse(response, { errorPrefix });
};

/// Изменение товара ///
export const sendProductUpdateRequest = (productId, formData) => async (dispatch) => {
    const url = `/api/catalog/products/${productId}`;
    const options = {
        method: 'PUT',
        body: formData // Заголовки для объекта FormData устанавливаются автоматически браузером
    };
    const errorPrefix = 'Не удалось изменить товар';
    const config = {
        authRequired: true,
        timeout: 10000,
        minDelay: 750,
        errorPrefix
    };

    const response = await dispatch(apiFetch(url, options, config));
    return await apiResponse(response, { errorPrefix });
};

/// Изменение группы товаров ///
export const sendBulkProductUpdateRequest = (productIds, formFields) => async (dispatch) => {
    const url = '/api/catalog/products/bulk';
    const options = {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productIds, formFields })
    };
    const errorPrefix = 'Не удалось изменить группу товаров';
    const config = {
        authRequired: true,
        timeout: 15000,
        minDelay: 750,
        errorPrefix
    };

    const response = await dispatch(apiFetch(url, options, config));
    return await apiResponse(response, { errorPrefix });
};

/// Удаление товара ///
export const sendProductDeleteRequest = (productId) => async (dispatch) => {
    const url = `/api/catalog/products/${productId}`;
    const options = { method: 'DELETE' };
    const errorPrefix = 'Не удалось удалить товар';
    const config = {
        authRequired: true,
        timeout: 10000,
        minDelay: 500,
        errorPrefix
    };

    const response = await dispatch(apiFetch(url, options, config));
    return await apiResponse(response, { errorPrefix });
};

/// Удаление группы товаров ///
export const sendBulkProductDeleteRequest = (productIds) => async (dispatch) => {
    const url = '/api/catalog/products/bulk';
    const options = {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productIds })
    };
    const errorPrefix = 'Не удалось удалить группу товаров';
    const config = {
        authRequired: true,
        timeout: 15000,
        minDelay: 500,
        errorPrefix
    };

    const response = await dispatch(apiFetch(url, options, config));
    return await apiResponse(response, { errorPrefix });
};
