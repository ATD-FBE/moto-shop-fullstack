import config from './config.js';
import { STORAGE_URL_PATH } from './paths.js';
import { getCustomerOrderDetailsPath } from '../../shared/commonHelpers.js';

const { env, protocol, host, clientPort } = config;

// Базовый URL фронтенда
export const BASE_CLIENT_URL = env === 'production'
    ? `${protocol}://${host}`
    : `${protocol}://${host}:${clientPort}`;

// URL хранилища файлов
export const STORAGE_URL = `${BASE_CLIENT_URL}${STORAGE_URL_PATH}`;

// URL страницы деталей покупателя
export const getCustomerOrderDetailsUrl = (orderNumber, orderId) =>
    `${BASE_CLIENT_URL}${getCustomerOrderDetailsPath(orderNumber, orderId)}`;
