import apiFetch from './core/apiFetch.js';
import apiResponse from './core/apiResponse.js';

/*
GET /api/orders - Получить список заказов. История заказов.
GET /api/orders/:orderId - Получить заказ по id. Конкретный заказ клиента или админа.
GET /api/orders/:orderId/items/availability - Получить доступное кол-во заказанных товаров на складе.
GET /api/orders/:orderId/financials/invoice/pdf - Получить счёт по заказу.
GET /api/orders/:orderId/financials/remaining - Получить остаток стоимости для оплаты онлайн.
POST /api/orders/webhook - Обработка ответа платёжки при оплате картой онлайн.
POST /api/orders/:orderId/repeat - Повторить заказ клиентом.
POST /api/orders/:orderId/financials/payments/online - Внести оплату клиентом онлайн-картой.
POST /api/orders/:orderId/financials/refunds/online/full - Сделать возврат админом всех платежей онлайн-картами.
PATCH /api/orders/:orderId - Изменить данные заказа админом (кроме товаров, статуса, оплаты, заметки).
PATCH /api/orders/:orderId/items - Изменить количество товаров в заказе админом.
PATCH /api/orders/:orderId/internal-note - Изменить внутреннюю заметку в заказе админом.
PATCH /api/orders/:orderId/financials/events/:eventId/void - Аннулирование записи в истории финансов админом.
PATCH /api/orders/:orderId/status - Изменить статус заказа админом.
PATCH /api/orders/:orderId/financials/payments/offline - Внести результат оплаты админом оффлайн-методом.
PATCH /api/orders/:orderId/financials/refunds/offline - Внести результат возврата админом оффлайн-методом.
DELETE /api/orders/:orderId - Удалить отменённый заказ админом. По запросу клиента или правилам.
*/

/// Загрузка списка заказов для одной страницы ///
export const sendOrderListRequest = (urlParams) => async (dispatch) => {
    const url = `/api/orders?${urlParams}`;
    const options = { method: 'GET' };
    const errorPrefix = 'Не удалось загрузить заказы';
    const config = {
        authRequired: true,
        timeout: 15000,
        minDelay: 500,
        errorPrefix
    };

    const response = await dispatch(apiFetch(url, options, config));
    return await apiResponse(response, { errorPrefix });
};

/// Загрузка или обновление отдельного заказа ///
export const sendOrderRequest = (orderId, urlParams) => async (dispatch) => {
    const url = `/api/orders/${orderId}?${urlParams}`;
    const options = { method: 'GET' };
    const errorPrefix = 'Не удалось загрузить заказ';
    const config = {
        authRequired: true,
        timeout: 10000,
        minDelay: 500,
        errorPrefix
    };

    const response = await dispatch(apiFetch(url, options, config));
    return await apiResponse(response, { errorPrefix });
};

/// Загрузка доступного на складе количества товаров в заказе ///
export const sendOrderItemsAvailabilityRequest = (orderId) => async (dispatch) => {
    const url = `/api/orders/${orderId}/items/availability`;
    const options = { method: 'GET' };
    const errorPrefix = 'Не удалось получить доступное на складе количество товаров из заказа';
    const config = {
        authRequired: true,
        timeout: 10000,
        minDelay: 0,
        errorPrefix
    };

    const response = await dispatch(apiFetch(url, options, config));
    return await apiResponse(response, { errorPrefix });
};

/// Повтор завершённого или отменённого заказа ///
export const sendOrderRepeatRequest = (orderId) => async (dispatch) => {
    const url = `/api/orders/${orderId}/repeat`;
    const options = { method: 'POST' };
    const errorPrefix = 'Ошибка при повторе заказа';
    const config = {
        authRequired: true,
        timeout: 10000,
        minDelay: 750,
        errorPrefix
    };

    const response = await dispatch(apiFetch(url, options, config));
    return await apiResponse(response, { errorPrefix });
};

/// Изменение внутренней заметки заказа (SSE у клиента) ///
export const sendOrderInternalNoteUpdateRequest = (orderId, formFields) => async (dispatch) => {
    const url = `/api/orders/${orderId}/internal-note`;
    const options = {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formFields)
    };
    const errorPrefix = 'Не удалось изменить внутреннюю заметку заказа';
    const config = {
        authRequired: true,
        timeout: 10000,
        minDelay: 0,
        errorPrefix
    };

    const response = await dispatch(apiFetch(url, options, config));
    return await apiResponse(response, { errorPrefix });
};

/// Изменение деталей подтверждённого заказа (SSE у клиента) ///
export const sendOrderDetailsUpdateRequest = (orderId, formFields) => async (dispatch) => {
    const url = `/api/orders/${orderId}`;
    const options = {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formFields)
    };
    const errorPrefix = 'Не удалось изменить заказ';
    const config = {
        authRequired: true,
        timeout: 12000,
        minDelay: 0,
        errorPrefix
    };

    const response = await dispatch(apiFetch(url, options, config));
    return await apiResponse(response, { errorPrefix });
};

/// Изменение товаров подтверждённого заказа (SSE у клиента) ///
export const sendOrderItemsUpdateRequest = (orderId, formFields) => async (dispatch) => {
    const url = `/api/orders/${orderId}/items`;
    const options = {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formFields)
    };
    const errorPrefix = 'Не удалось изменить товары в заказе';
    const config = {
        authRequired: true,
        timeout: 12000,
        minDelay: 0,
        errorPrefix
    };

    const response = await dispatch(apiFetch(url, options, config));
    return await apiResponse(response, { errorPrefix });
};

/// Изменение статуса заказа (SSE у клиента) ///
export const sendOrderStatusUpdateRequest = (orderId, requestData) => async (dispatch) => {
    const url = `/api/orders/${orderId}/status`;
    const options = {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData)
    };
    const errorPrefix = 'Не удалось изменить статус заказа';
    const config = {
        authRequired: true,
        timeout: 15000,
        minDelay: 0,
        errorPrefix
    };

    const response = await dispatch(apiFetch(url, options, config));
    return await apiResponse(response, { errorPrefix });
};

/// Генерация и загрузка счёта заказа в pdf ///
export const sendOrderInvoicePdfRequest = (orderId) => async (dispatch) => {
    const url = `/api/orders/${orderId}/financials/invoice/pdf`;
    const options = { method: 'GET' };
    const errorPrefix = 'Не удалось загрузить счёт';
    const config = {
        authRequired: true,
        timeout: 10000,
        minDelay: 0,
        errorPrefix
    };

    const response = await dispatch(apiFetch(url, options, config));
    return await apiResponse(response, { errorPrefix, asFile: true });
};

/// Вычисление и загрузка остатка для оплаты заказа банковской картой онлайн ///
export const sendOrderRemainingAmountRequest = (orderId) => async (dispatch) => {
    const url = `/api/orders/${orderId}/financials/remaining`;
    const options = { method: 'GET' };
    const errorPrefix = 'Не удалось вычислить остаток оплаты заказа';
    const config = {
        authRequired: true,
        timeout: 10000,
        minDelay: 250,
        errorPrefix
    };

    const response = await dispatch(apiFetch(url, options, config));
    return await apiResponse(response, { errorPrefix });
};

/// Аннулирование записи успешного финансового события в заказе (SSE у клиента) ///
export const sendOrderFinancialsEventVoidRequest = (params, payload) => async (dispatch) => {
    const { orderId, eventId } = params;
    const url = `/api/orders/${orderId}/financials/events/${eventId}/void`;
    const options = {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    };
    const errorPrefix = 'Не удалось аннулировать запись в истории финансов заказа';
    const config = {
        authRequired: true,
        timeout: 10000,
        minDelay: 0,
        errorPrefix
    };

    const response = await dispatch(apiFetch(url, options, config));
    return await apiResponse(response, { errorPrefix });
};

/// Внесение оплаты за заказ оффлайн-методом (SSE у клиента) ///
export const sendOrderOfflinePaymentApplyRequest = (orderId, requestData) => async (dispatch) => {
    const url = `/api/orders/${orderId}/financials/payments/offline`;
    const options = {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData)
    };
    const errorPrefix = 'Не удалось внести оплату заказа оффлайн-методом';
    const config = {
        authRequired: true,
        timeout: 12000,
        minDelay: 0,
        errorPrefix
    };

    const response = await dispatch(apiFetch(url, options, config));
    return await apiResponse(response, { errorPrefix });
};

/// Возврат средств за заказ оффлайн-методом (SSE у клиента) ///
export const sendOrderOfflineRefundApplyRequest = (orderId, requestData) => async (dispatch) => {
    const url = `/api/orders/${orderId}/financials/refunds/offline`;
    const options = {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData)
    };
    const errorPrefix = 'Не удалось вернуть средства оффлайн-методом';
    const config = {
        authRequired: true,
        timeout: 12000,
        minDelay: 0,
        errorPrefix
    };

    const response = await dispatch(apiFetch(url, options, config));
    return await apiResponse(response, { errorPrefix });
};

/// Создание онлайн платежа для банковской карты ///
export const sendOrderOnlinePaymentCreateRequest = (orderId, requestData) => async (dispatch) => {
    const url = `/api/orders/${orderId}/financials/payments/online`;
    const options = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestData)
    };
    const errorPrefix = 'Не удалось создать онлайн-платёж для карты';
    const config = {
        authRequired: true,
        timeout: 15000,
        minDelay: 750,
        errorPrefix
    };

    const response = await dispatch(apiFetch(url, options, config));
    return await apiResponse(response, { errorPrefix });
};

/// Создание возвратов для банковских карт ///
export const sendOrderOnlineRefundsCreateRequest = (orderId) => async (dispatch) => {
    const url = `/api/orders/${orderId}/financials/refunds/online/full`;
    const options = { method: 'POST' };
    const errorPrefix = 'Не удалось создать онлайн-возвраты на карты';
    const config = {
        authRequired: true,
        timeout: 15000,
        minDelay: 750,
        errorPrefix
    };

    const response = await dispatch(apiFetch(url, options, config));
    return await apiResponse(response, { errorPrefix });
};
