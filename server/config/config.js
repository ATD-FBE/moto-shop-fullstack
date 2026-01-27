import dotenv from 'dotenv';
import { join } from 'path';
import { CONFIG_PATH } from './paths.js';

const environment = process.env.NODE_ENV || 'development';
dotenv.config({ path: join(CONFIG_PATH, `.env.${environment}`) });

export default {
    env: environment,
    protocol: process.env.PROTOCOL || 'http',
    host: process.env.HOST || 'localhost',
    clientPort: process.env.CLIENT_PORT || 3000,
    serverPort: process.env.SERVER_PORT || 5000,
    databaseUrl: process.env.MONGO_URI,
    accessSecretKey: process.env.JWT_ACCESS_SECRET_KEY,
    refreshSecretKey: process.env.JWT_REFRESH_SECRET_KEY,
    adminCode: process.env.ADMIN_CODE,
    yooKassaShopId: process.env.YOOKASSA_SHOP_ID,
    yooKassaSecretKey: process.env.YOOKASSA_SECRET_KEY,
    yooKassaTest: process.env.YOOKASSA_TEST
};
