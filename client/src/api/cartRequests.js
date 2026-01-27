import apiFetch from './core/apiFetch.js';
import apiResponse from './core/apiResponse.js';

/// Синхронизация гостевой корзины ///
export const sendGuestCartItemListRequest = (guestCart) => async (dispatch) => {
    const url = '/api/cart/guest';
    const options = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guestCart })
    };
    const errorPrefix = 'Не удалось синхронизировать гостевую корзину';
    const config = {
        authRequired: false,
        timeout: 10000,
        minDelay: 500,
        errorPrefix
    };

    const response = await dispatch(apiFetch(url, options, config));
    return await apiResponse(response, { errorPrefix });
};

/// Загрузка серверной корзины ///
export const sendCartItemListRequest = () => async (dispatch) => {
    const url = '/api/cart';
    const options = { method: 'GET' };
    const errorPrefix = 'Не удалось загрузить корзину аккаунта';
    const config = {
        authRequired: true,
        timeout: 10000,
        minDelay: 500,
        errorPrefix
    };

    const response = await dispatch(apiFetch(url, options, config));
    return await apiResponse(response, { errorPrefix });
};

/// Изменение количества товара в корзине ///
export const sendCartItemUpdateRequest = (productId, cartItemData) => async (dispatch) => {
    const url = `/api/cart/items/${productId}`;
    const options = {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cartItemData)
    };
    const errorPrefix = 'Не удалось изменить количество товара в корзине';
    const config = {
        authRequired: true,
        timeout: 10000,
        minDelay: 250,
        errorPrefix
    };

    const response = await dispatch(apiFetch(url, options, config));
    return await apiResponse(response, { errorPrefix });
};

/// Восстановление товара в корзине ///
export const sendCartItemRestoreRequest = (productId, cartItemData) => async (dispatch) => {
    const url = `/api/cart/items/restore/${productId}`;
    const options = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cartItemData)
    };
    const errorPrefix = 'Не удалось восстановить товар в корзине';
    const config = {
        authRequired: true,
        timeout: 10000,
        minDelay: 250,
        errorPrefix
    };

    const response = await dispatch(apiFetch(url, options, config));
    return await apiResponse(response, { errorPrefix });
};

/// Исправление всех проблемных товаров в корзине ///
export const sendCartWarningsFixRequest = () => async (dispatch) => {
    const url = '/api/cart/warnings';
    const options = { method: 'PATCH' };
    const errorPrefix = 'Не удалось исправить проблемные товары в корзине';
    const config = {
        authRequired: true,
        timeout: 10000,
        minDelay: 500,
        errorPrefix
    };

    const response = await dispatch(apiFetch(url, options, config));
    return await apiResponse(response, { errorPrefix });
};

/// Удаление товара из корзины ///
export const sendCartItemRemoveRequest = (productId) => async (dispatch) => {
    const url = `/api/cart/items/${productId}`;
    const options = { method: 'DELETE' };
    const errorPrefix = 'Не удалось удалить товар из корзины';
    const config = {
        authRequired: true,
        timeout: 10000,
        minDelay: 250,
        errorPrefix
    };

    const response = await dispatch(apiFetch(url, options, config));
    return await apiResponse(response, { errorPrefix });
};

/// Очистка корзины ///
export const sendCartClearRequest = () => async (dispatch) => {
    const url = '/api/cart/clear';
    const options = { method: 'DELETE' };
    const errorPrefix = 'Не удалось очистить корзину';
    const config = {
        authRequired: true,
        timeout: 10000,
        minDelay: 250,
        errorPrefix
    };

    const response = await dispatch(apiFetch(url, options, config));
    return await apiResponse(response, { errorPrefix });
};

/// Объединение товаров в гостевой и серверной корзинах ///
/*export const sendCartMergeRequest = (guestCart) => async (dispatch) => {
    const url = '/api/cart/merge';
    const options = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guestCart })
    };
    const errorPrefix = 'Не удалось объединить серверную и гостевую корзины';
    const config = {
        authRequired: true,
        timeout: 10000,
        minDelay: 375,
        errorPrefix
    };

    const response = await dispatch(apiFetch(url, options, config));
    return await apiResponse(response, { errorPrefix });
};*/
