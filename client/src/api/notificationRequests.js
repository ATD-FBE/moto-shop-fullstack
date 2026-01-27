import apiFetch from './core/apiFetch.js';
import apiResponse from './core/apiResponse.js';

/// Загрузка списка уведомлений на страницу (для управления админом или просмотра клиентом) ///
export const sendNotificationListRequest = (urlParams) => async (dispatch) => {
    const url = `/api/notifications?${urlParams}`;
    const options = { method: 'GET' };
    const errorPrefix = 'Не удалось загрузить уведомления';
    const config = {
        authRequired: true,
        timeout: 15000,
        minDelay: 500,
        errorPrefix
    };

    const response = await dispatch(apiFetch(url, options, config));
    return await apiResponse(response, { errorPrefix });
};

/// Загрузка черновика уведомления для редактирования ///
export const sendNotificationRequest = (notificationId) => async (dispatch) => {
    const url = `/api/notifications/${notificationId}`;
    const options = { method: 'GET' };
    const errorPrefix = 'Не удалось загрузить уведомление';
    const config = {
        authRequired: true,
        timeout: 10000,
        minDelay: 500,
        errorPrefix
    };

    const response = await dispatch(apiFetch(url, options, config));
    return await apiResponse(response, { errorPrefix });
};

/// Создание черновика уведомления ///
export const sendNotificationCreateRequest = (formFields) => async (dispatch) => {
    const url = '/api/notifications';
    const options = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formFields)
    };
    const errorPrefix = 'Не удалось создать уведомление';
    const config = {
        authRequired: true,
        timeout: 10000,
        minDelay: 750,
        errorPrefix
    };

    const response = await dispatch(apiFetch(url, options, config));
    return await apiResponse(response, { errorPrefix });
};

/// Изменение черновика уведомления ///
export const sendNotificationUpdateRequest = (notificationId, formFields) => async (dispatch) => {
    const url = `/api/notifications/${notificationId}`;
    const options = {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formFields)
    };
    const errorPrefix = 'Не удалось изменить уведомление';
    const config = {
        authRequired: true,
        timeout: 10000,
        minDelay: 750,
        errorPrefix
    };

    const response = await dispatch(apiFetch(url, options, config));
    return await apiResponse(response, { errorPrefix });
};

/// Отправка уведомления ///
export const sendNotificationSendingRequest = (notificationId) => async (dispatch) => {
    const url = `/api/notifications/${notificationId}/send`;
    const options = { method: 'PATCH' };
    const errorPrefix = 'Не удалось отправить уведомление';
    const config = {
        authRequired: true,
        timeout: 10000,
        minDelay: 750,
        errorPrefix
    };

    const response = await dispatch(apiFetch(url, options, config));
    return await apiResponse(response, { errorPrefix });
};

/// Удаление черновика уведомления ///
export const sendNotificationDeleteRequest = (notificationId) => async (dispatch) => {
    const url = `/api/notifications/${notificationId}`;
    const options = { method: 'DELETE' };
    const errorPrefix = 'Не удалось удалить уведомление';
    const config = {
        authRequired: true,
        timeout: 10000,
        minDelay: 500,
        errorPrefix
    };

    const response = await dispatch(apiFetch(url, options, config));
    return await apiResponse(response, { errorPrefix });
};

/// Отметка уведомления как прочитанного ///
export const sendNotificationMarkAsReadRequest = (notificationId) => async (dispatch) => {
    const url = `/api/notifications/${notificationId}/read`;
    const options = { method: 'PATCH' };
    const errorPrefix = 'Не удалось отметить уведомление как прочитанное';
    const config = {
        authRequired: true,
        timeout: 10000,
        minDelay: 250,
        errorPrefix
    };

    const response = await dispatch(apiFetch(url, options, config));
    return await apiResponse(response, { errorPrefix });
};
