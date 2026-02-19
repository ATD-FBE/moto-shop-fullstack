import apiFetch from './core/apiFetch.js';
import apiResponse from './core/apiResponse.js';

const AUTH_TIMEOUT = 20000;

/// Регистрация ///
export const sendAuthRegistrationRequest = (formFields, guestCart) => async (dispatch) => {
    const url = '/api/auth/register';
    const options = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ formFields, guestCart })
    };
    const errorPrefix = 'Ошибка регистрации';
    const config = {
        authRequired: false,
        timeout: AUTH_TIMEOUT,
        minDelay: 750,
        errorPrefix
    };

    const response = await dispatch(apiFetch(url, options, config));
    return await apiResponse(response, { errorPrefix });
};

/// Авторизация ///
export const sendAuthLoginRequest = (formFields, guestCart) => async (dispatch) => {
    const url = '/api/auth/login';
    const options = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ formFields, guestCart })
    };
    const errorPrefix = 'Ошибка авторизации';
    const config = {
        authRequired: false,
        timeout: AUTH_TIMEOUT,
        minDelay: 750,
        errorPrefix
    };

    const response = await dispatch(apiFetch(url, options, config));
    return await apiResponse(response, { errorPrefix });
};

/// Загрузка данных сессии пользователя ///
export const sendAuthSessionRequest = (guestCart) => async (dispatch) => {
    const url = '/api/auth/session';
    const options = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guestCart })
    };
    const errorPrefix = 'Не удалось получить данные пользователя';
    const config = {
        authRequired: true,
        skipRefreshTokenCheck: true,
        timeout: AUTH_TIMEOUT,
        minDelay: 750,
        errorPrefix
    };

    const response = await dispatch(apiFetch(url, options, config));
    return await apiResponse(response, { errorPrefix });
};

/// Изменение данных пользователя ///
export const sendAuthUserUpdateRequest = (formFields) => async (dispatch) => {
    const url = '/api/auth/user';
    const options = {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formFields)
    };
    const errorPrefix = 'Не удалось изменить данные пользователя';
    const config = {
        authRequired: true,
        timeout: AUTH_TIMEOUT,
        minDelay: 750,
        errorPrefix
    };

    const response = await dispatch(apiFetch(url, options, config));
    return await apiResponse(response, { errorPrefix });
};

/// Обновление токена доступа ///
export const sendAuthRefreshRequest = () => async (dispatch) => {
    const url = '/api/auth/refresh';
    const options = { method: 'POST' };
    const errorPrefix = 'Не удалось обновить токен доступа';
    const config = {
        authRequired: false,
        timeout: AUTH_TIMEOUT,
        minDelay: 0,
        errorPrefix
    };

    const response = await dispatch(apiFetch(url, options, config));
    return await apiResponse(response, { errorPrefix });
};

/// Загрузка настроек заказа ///
export const sendAuthCheckoutPrefsRequest = () => async (dispatch) => {
    const url = '/api/auth/checkout-preferences';
    const options = { method: 'GET' };
    const errorPrefix = 'Не удалось загрузить настройки заказа';
    const config = {
        authRequired: true,
        timeout: AUTH_TIMEOUT,
        minDelay: 500,
        errorPrefix
    };

    const response = await dispatch(apiFetch(url, options, config));
    return await apiResponse(response, { errorPrefix });
};

/// Изменение настроек заказа ///
export const sendAuthCheckoutPrefsUpdateRequest = (formFields) => async (dispatch) => {
    const url = '/api/auth/checkout-preferences';
    const options = {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formFields)
    };
    const errorPrefix = 'Не удалось изменить настройки заказа';
    const config = {
        authRequired: true,
        timeout: 10000,
        minDelay: 750,
        errorPrefix
    };

    const response = await dispatch(apiFetch(url, options, config));
    return await apiResponse(response, { errorPrefix });
};

/// Выход из сессии ///
export const sendAuthLogoutRequest = () => async (dispatch) => {
    const url = '/api/auth/logout';
    const options = { method: 'POST' };
    const errorPrefix = 'Ошибка выхода из сессии';
    const config = {
        authRequired: false,
        timeout: AUTH_TIMEOUT,
        minDelay: 0,
        errorPrefix
    };

    const response = await dispatch(apiFetch(url, options, config));
    return await apiResponse(response, { errorPrefix });
};
