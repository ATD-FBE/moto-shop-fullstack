import apiFetch from './core/apiFetch.js';
import apiResponse from './core/apiResponse.js';

/// Загрузка списков ID всех отфильтрованных клиентов и их данных для одной страницы таблицы ///
export const sendCustomerListRequest = (urlParams) => async (dispatch) => {
    const url = `/api/customers?${urlParams}`;
    const options = { method: 'GET' };
    const errorPrefix = 'Не удалось загрузить данные клиентов';
    const config = {
        authRequired: true,
        timeout: 15000,
        minDelay: 500,
        errorPrefix
    };

    const response = await dispatch(apiFetch(url, options, config));
    return await apiResponse(response, { errorPrefix });
};

/// Загрузка заказов клиента в таблице ///
export const sendCustomerOrderListRequest = (customerId, urlParams) => async (dispatch) => {
    const url = `/api/customers/${customerId}/orders?${urlParams}`;
    const options = { method: 'GET' };
    const errorPrefix = 'Не удалось загрузить заказы клиента';
    const config = {
        authRequired: true,
        timeout: 15000,
        minDelay: 500,
        errorPrefix
    };

    const response = await dispatch(apiFetch(url, options, config));
    return await apiResponse(response, { errorPrefix });
};

/// Изменение скидки клиента ///
export const sendCustomerDiscountUpdateRequest = (customerId, discount) => async (dispatch) => {
    const url = `/api/customers/${customerId}/discount`;
    const options = {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ discount })
    };
    const errorPrefix = 'Не удалось измененить скидку клиента';
    const config = {
        authRequired: true,
        timeout: 10000,
        minDelay: 250,
        errorPrefix
    };

    const response = await dispatch(apiFetch(url, options, config));
    return await apiResponse(response, { errorPrefix });
};

/// Изменение статуса блокировки клиента ///
export const sendCustomerBanToggleRequest = (customerId, newBanStatus) => async (dispatch) => {
    const url = `/api/customers/${customerId}/ban`;
    const options = {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newBanStatus })
    };
    const errorPrefix = 'Не удалось измененить статус блокировки клиента';
    const config = {
        authRequired: true,
        timeout: 10000,
        minDelay: 250,
        errorPrefix
    };

    const response = await dispatch(apiFetch(url, options, config));
    return await apiResponse(response, { errorPrefix });
};
