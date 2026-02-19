import apiFetch from './core/apiFetch.js';
import apiResponse from './core/apiResponse.js';

const CATEGORY_TIMEOUT = 20000;

/// Загрузка всех категорий ///
export const sendCategoryListRequest = () => async (dispatch) => {
    const url = '/api/catalog/categories';
    const options = { method: 'GET' };
    const errorPrefix = 'Не удалось загрузить категории товаров';
    const config = {
        authRequired: false,
        timeout: CATEGORY_TIMEOUT,
        minDelay: 250,
        errorPrefix
    };

    const response = await dispatch(apiFetch(url, options, config));
    return await apiResponse(response, { errorPrefix });
};

/// Создание категории ///
export const sendCategoryCreateRequest = (formFields) => async (dispatch) => {
    const url = '/api/catalog/categories';
    const options = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formFields)
    };
    const errorPrefix = 'Не удалось создать категорию товаров';
    const config = {
        authRequired: true,
        timeout: CATEGORY_TIMEOUT,
        minDelay: 750,
        errorPrefix
    };

    const response = await dispatch(apiFetch(url, options, config));
    return await apiResponse(response, { errorPrefix });
};

/// Изменение категории ///
export const sendCategoryUpdateRequest = (categoryId, formFields) => async (dispatch) => {
    const url = `/api/catalog/categories/${categoryId}`;
    const options = {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formFields)
    };
    const errorPrefix = 'Не удалось изменить категорию товаров';
    const config = {
        authRequired: true,
        timeout: CATEGORY_TIMEOUT,
        minDelay: 750,
        errorPrefix
    };

    const response = await dispatch(apiFetch(url, options, config));
    return await apiResponse(response, { errorPrefix });
};

/// Удаление категории ///
export const sendCategoryDeleteRequest = (categoryId) => async (dispatch) => {
    const url = `/api/catalog/categories/${categoryId}`;
    const options = { method: 'DELETE' };
    const errorPrefix = 'Не удалось удалить категорию товаров';
    const config = {
        authRequired: true,
        timeout: CATEGORY_TIMEOUT,
        minDelay: 500,
        errorPrefix
    };

    const response = await dispatch(apiFetch(url, options, config));
    return await apiResponse(response, { errorPrefix });
};
