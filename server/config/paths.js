import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const SERVER_FOLDER = 'server';
export const SERVER_ROOT = join(__dirname, '..');

export const CONFIG_FOLDER = 'config';
export const CONFIG_PATH = join(SERVER_ROOT, CONFIG_FOLDER);

export const PROJECT_ROOT = join(SERVER_ROOT, '..');

export const LOG_FOLDER = '_logs';
export const LOG_ROOT = join(PROJECT_ROOT, LOG_FOLDER);

export const LOG_COMBINED_FILE = 'combined.log';
export const LOG_COMBINED_FILE_PATH = join(LOG_ROOT, LOG_COMBINED_FILE);

export const LOG_ERROR_FILE = 'error.log';
export const LOG_ERROR_FILE_PATH = join(LOG_ROOT, LOG_ERROR_FILE);

export const CLIENT_FOLDER = 'client';
export const CLIENT_ROOT = join(PROJECT_ROOT, CLIENT_FOLDER);

export const PUBLIC_FOLDER = 'public';
export const PUBLIC_PATH = join(CLIENT_ROOT, PUBLIC_FOLDER);

export const BUILD_FOLDER = 'build'
export const BUILD_PATH = join(CLIENT_ROOT, BUILD_FOLDER);

export const STORAGE_FOLDER = 'storage';
export const STORAGE_ROOT = join(PROJECT_ROOT, STORAGE_FOLDER);

export const PROMO_STORAGE_FOLDER = 'promos';
export const PROMO_STORAGE_PATH = join(STORAGE_ROOT, PROMO_STORAGE_FOLDER);

export const PRODUCT_STORAGE_FOLDER = 'products';
export const PRODUCT_STORAGE_PATH = join(STORAGE_ROOT, PRODUCT_STORAGE_FOLDER);

export const PRODUCT_ORIGINALS_FOLDER = 'originals';
export const PRODUCT_THUMBNAILS_FOLDER = 'thumbnails';

export const ORDER_STORAGE_FOLDER = 'orders';
export const ORDER_STORAGE_PATH = join(STORAGE_ROOT, ORDER_STORAGE_FOLDER);

export const STORAGE_URL_PATH = '/files'; // Путь для доступа к файлам через клиентский URL
