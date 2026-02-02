import apiFetch from './core/apiFetch.js';
import apiResponse from './core/apiResponse.js';

const CHECKOUT_TIMEOUT = 32000;

/// Загрузка черновика заказа ///
export const sendOrderDraftRequest = (orderId) => async (dispatch) => {
    const url = `/api/checkout/draft-orders/${orderId}/prepare`;
    const options = { method: 'POST' };
    const errorPrefix = 'Не удалось загрузить черновик заказа';
    const config = {
        authRequired: true,
        timeout: CHECKOUT_TIMEOUT,
        minDelay: 500,
        errorPrefix
    };

    const response = await dispatch(apiFetch(url, options, config));
    return await apiResponse(response, { errorPrefix });
};

/// Создание черновика заказа ///
export const sendOrderDraftCreateRequest = (cartProductSnapshots) => async (dispatch) => {
    const url = '/api/checkout/draft-orders';
    const options = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cartProductSnapshots })
    };
    const errorPrefix = 'Не удалось создать черновик заказа';
    const config = {
        authRequired: true,
        timeout: CHECKOUT_TIMEOUT,
        minDelay: 750,
        errorPrefix
    };

    const response = await dispatch(apiFetch(url, options, config));
    return await apiResponse(response, { errorPrefix });
};

/// Изменение черновика заказа ///
export const sendOrderDraftUpdateRequest = (orderId, formFields) => async (dispatch) => {
    const url = `/api/checkout/draft-orders/${orderId}`;
    const options = {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formFields)
    };
    const errorPrefix = 'Не удалось изменить черновик заказа';
    const config = {
        authRequired: true,
        timeout: CHECKOUT_TIMEOUT,
        minDelay: 250,
        errorPrefix
    };

    const response = await dispatch(apiFetch(url, options, config));
    return await apiResponse(response, { errorPrefix });
};

/// Подтверждение оформления заказа ///
export const sendOrderDraftConfirmRequest = (orderId, formFields) => async (dispatch) => {
    const url = `/api/checkout/draft-orders/${orderId}/confirm`;
    const options = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formFields)
    };
    const errorPrefix = 'Не удалось подтвердить заказ';
    const config = {
        authRequired: true,
        timeout: CHECKOUT_TIMEOUT,
        minDelay: 750,
        errorPrefix
    };

    const response = await dispatch(apiFetch(url, options, config));
    return await apiResponse(response, { errorPrefix });
};

/// Отмена оформления заказа ///
export const sendOrderDraftDeleteRequest = (orderId) => async (dispatch) => {
    const url = `/api/checkout/draft-orders/${orderId}`;
    const options = { method: 'DELETE' };
    const errorPrefix = 'Не удалось отменить заказ';
    const config = {
        authRequired: true,
        timeout: CHECKOUT_TIMEOUT,
        minDelay: 750,
        errorPrefix
    };

    const response = await dispatch(apiFetch(url, options, config));
    return await apiResponse(response, { errorPrefix });
};
