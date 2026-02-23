import dotenv from 'dotenv';
import { join } from 'path';
import { CONFIG_PATH } from './paths.js';
import { SERVER_CONSTANTS } from '../../shared/constants.js';

const { MONGO_MODE, STORAGE_TYPE, MULTER_MODE } = SERVER_CONSTANTS;

const environment = process.env.NODE_ENV || 'development';
dotenv.config({ path: join(CONFIG_PATH, `.env.${environment}`) });

const resolveMongoUri = () => {
    const mode = process.env.MONGO_MODE;

    if (mode === MONGO_MODE.LOCAL) {
        return process.env.MONGO_URI_LOCAL;
    }

    if (mode === MONGO_MODE.ATLAS) {
        return process.env.MONGO_URI_ATLAS;
    }

    throw new Error(`Некорректный режим MongoDB: ${mode}`);
};

const resolveStorageConfig = () => {
    const type = process.env.STORAGE_TYPE;

    if (type === STORAGE_TYPE.FS) {
        return {
            type: STORAGE_TYPE.FS,
            multerMode: MULTER_MODE.DISK
        };
    }

    if (type === STORAGE_TYPE.S3) {
        const {
            STORAGE_S3_BUCKET,
            STORAGE_S3_BUCKET_TYPE,
            STORAGE_S3_ACCESS_KEY,
            STORAGE_S3_SECRET_KEY,
            STORAGE_S3_REGION,
            STORAGE_S3_ENDPOINT
        } = process.env;
    
        if (
            !STORAGE_S3_BUCKET ||
            !STORAGE_S3_BUCKET_TYPE ||
            !STORAGE_S3_ACCESS_KEY ||
            !STORAGE_S3_SECRET_KEY
        ) {
            throw new Error('S3 storage выбран, но переменные окружения заданы не полностью');
        }
    
        return {
            type: STORAGE_TYPE.S3,
            multerMode: MULTER_MODE.MEMORY,
            bucket: STORAGE_S3_BUCKET,
            bucketType: STORAGE_S3_BUCKET_TYPE,
            accessKey: STORAGE_S3_ACCESS_KEY,
            secretKey: STORAGE_S3_SECRET_KEY,
            region: STORAGE_S3_REGION,
            endpoint: STORAGE_S3_ENDPOINT
        };
    }

    throw new Error(`Неизвестный тип файлового хранилища: ${type}`);
};

export default {
    env: environment,
    protocol: process.env.PROTOCOL || 'http',
    host: process.env.HOST || 'localhost',
    domain: process.env.DOMAIN || 'localhost',
    clientPort: process.env.CLIENT_PORT || 3000,
    serverPort: process.env.PORT || process.env.SERVER_PORT || 3001,
    jwt: {
        accessSecretKey: process.env.JWT_ACCESS_SECRET_KEY,
        refreshSecretKey: process.env.JWT_REFRESH_SECRET_KEY,
    },
    adminRegCode: process.env.ADMIN_REG_CODE,
    databaseUrl: resolveMongoUri(),
    storage: resolveStorageConfig(),
    yooKassa: {
        shopId: process.env.YOOKASSA_SHOP_ID,
        secretKey: process.env.YOOKASSA_SECRET_KEY
    }
};
