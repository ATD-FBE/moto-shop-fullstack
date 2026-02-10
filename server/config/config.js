import dotenv from 'dotenv';
import { join } from 'path';
import { CONFIG_PATH } from './paths.js';

const environment = process.env.NODE_ENV || 'development';
dotenv.config({ path: join(CONFIG_PATH, `.env.${environment}`) });

const resolveMongoUri = () => {
    const mode = process.env.MONGO_MODE;

    if (mode === 'local') {
        return process.env.MONGO_URI_LOCAL;
    }

    if (mode === 'atlas') {
        return process.env.MONGO_URI_ATLAS;
    }

    throw new Error(`Invalid MONGO_MODE: ${mode}`);
};

const resolveStorageConfig = () => {
    const type = process.env.STORAGE_TYPE;

    if (type === 'fs') {
        return { type: 'fs' };
    }

    if (type === 's3') {
        const {
            STORAGE_S3_BUCKET,
            STORAGE_S3_REGION,
            STORAGE_S3_ACCESS_KEY,
            STORAGE_S3_SECRET_KEY,
            STORAGE_S3_ENDPOINT
        } = process.env;
    
        if (!STORAGE_S3_BUCKET || !STORAGE_S3_ACCESS_KEY || !STORAGE_S3_SECRET_KEY) {
            throw new Error('S3 storage выбран, но переменные окружения заданы не полностью');
        }
    
        return {
            type: 's3',
            bucket: STORAGE_S3_BUCKET,
            region: STORAGE_S3_REGION,
            accessKey: STORAGE_S3_ACCESS_KEY,
            secretKey: STORAGE_S3_SECRET_KEY,
            endpoint: STORAGE_S3_ENDPOINT
        };
    }

    throw new Error(`Неизвестный тип файлового хранилища: ${type}`);
};

export default {
    env: environment,
    protocol: process.env.PROTOCOL || 'http',
    host: process.env.HOST || 'localhost',
    clientPort: process.env.CLIENT_PORT || 3000,
    serverPort: process.env.SERVER_PORT || 5000,
    databaseUrl: resolveMongoUri(),
    storage: resolveStorageConfig(),
    accessSecretKey: process.env.JWT_ACCESS_SECRET_KEY,
    refreshSecretKey: process.env.JWT_REFRESH_SECRET_KEY,
    adminCode: process.env.ADMIN_CODE,
    yooKassaShopId: process.env.YOOKASSA_SHOP_ID,
    yooKassaSecretKey: process.env.YOOKASSA_SECRET_KEY,
    yooKassaTest: process.env.YOOKASSA_TEST
};
