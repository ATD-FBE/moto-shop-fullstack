// Стандартные библиотеки
import https from 'https';
import http from 'http';
import fs from 'fs';

// Библиотеки третьих сторон
import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';

// Мидлвэары
import { requestContext } from './middlewares/requestContextMiddleware.js';
import { errorTracker, globalErrorHandler } from './middlewares/errorMiddleware.js';
import { serveStaticFiles, serveStorageFiles, serveReactApp } from './middlewares/fileMiddleware.js';
import { requestTimeout as reqTimeout } from './middlewares/timeoutMiddleware.js';
import { disableCache } from './middlewares/authMiddleware.js';

// Роутеры
import companyRouter from './routes/companyRouter.js';
import authRouter from './routes/authRouter.js';
import newsRouter from './routes/newsRouter.js';
import promoRouter from './routes/promoRouter.js';
import customerRouter from './routes/customerRouter.js';
import notificationRouter from './routes/notificationRouter.js';
import categoryRouter from './routes/categoryRouter.js';
import productRouter from './routes/productRouter.js';
import cartRouter from './routes/cartRouter.js';
import checkoutRouter from './routes/checkoutRouter.js';
import orderRouter from './routes/orderRouter.js';
import sseRouter from './routes/sseRouter.js';

// Конфигурация и пути
import config from './config/config.js';
import { STORAGE_URL_PATH } from './config/paths.js';

// Внутренние модули
import { connectMongoDB, shutdownMongoDB } from './database/mongoDB.js';
import { storageService } from './services/storage/storageService.js';
import { isCriticalError } from './utils/errorUtils.js';
import { startExpiredOrderDraftCleaner } from './services/cron/expiredOrderDraftCleaner.js';
import { startInitOnlineTransactionCleaner } from './services/cron/initOnlineTransactionCleaner.js';
import log from './utils/logger.js';

const app = express();
const apiRouter = express.Router();

const ENV = config.env;
const PROTOCOL = config.protocol;
const HOST = config.host;
const CLIENT_PORT = config.clientPort;
const SERVER_PORT = config.serverPort;

const sseCorsOptions = {
    origin: ENV === 'production'
        ? `${PROTOCOL}://${HOST}:${SERVER_PORT}`
        : `${PROTOCOL}://${HOST}:${CLIENT_PORT}`,
    methods: ['GET'],
    allowedHeaders: ['Content-Type'],
    credentials: true
};

app.use(serveStaticFiles(express)); // Работает в продакшне
app.get(`${STORAGE_URL_PATH}/*`, serveStorageFiles);

app.use(requestContext);
app.use(errorTracker);
app.use(cookieParser());
app.use(express.json());

apiRouter.use('/company', reqTimeout(15000), companyRouter);
apiRouter.use('/auth', reqTimeout(15000), disableCache, authRouter);
apiRouter.use('/news', reqTimeout(15000), newsRouter);
apiRouter.use('/promos', reqTimeout(20000), promoRouter);
apiRouter.use('/customers', reqTimeout(25000), customerRouter);
apiRouter.use('/notifications', reqTimeout(25000), notificationRouter);
apiRouter.use('/catalog/categories', reqTimeout(15000), categoryRouter);
apiRouter.use('/catalog/products', reqTimeout(30000), productRouter);
apiRouter.use('/cart', reqTimeout(10000), cartRouter);
apiRouter.use('/checkout/draft-orders', reqTimeout(30000), checkoutRouter);
apiRouter.use('/orders', reqTimeout(30000), orderRouter);
app.use('/api', apiRouter);

app.use('/sse', cors(sseCorsOptions), sseRouter);
app.get('*', serveReactApp); // Работает в продакшне
app.use(globalErrorHandler);

process.on('SIGINT', () => shutdownMongoDB('SIGINT'));
process.on('SIGTERM', () => shutdownMongoDB('SIGTERM'));
process.on('uncaughtException', (err) => {
    log.error('Uncaught exception:', err);
    if (isCriticalError(err)) shutdownMongoDB('uncaughtException');
});
process.on('unhandledRejection', (reason) => {
    log.error('Unhandled Rejection в коде', reason instanceof Error ? reason : { reason });
    if (isCriticalError(reason)) shutdownMongoDB('unhandledRejection');
});
process.on('exit', () => log.info('Process exit'));

const createServer = (protocol, host) => {
    if (protocol === 'https') {
        const keyPath = `./certs/${host}-key.pem`;
        const certPath = `./certs/${host}.pem`;

        const options = {
            key: fs.readFileSync(keyPath),
            cert: fs.readFileSync(certPath)
        };

        return https.createServer(options, app);
    }
    
    return http.createServer(app);
};

const startCronJobs = () => {
    startExpiredOrderDraftCleaner();
    startInitOnlineTransactionCleaner();
};

const startServer = async () => {
    try {
        await connectMongoDB();
        await storageService.initStorage();
        startCronJobs();

        const server = createServer(PROTOCOL, HOST);

        server.listen(SERVER_PORT, HOST, () => {
            log.info(`Сервер запущен по адресу: ${PROTOCOL}://${HOST}:${SERVER_PORT}`);
        });

        server.on('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                log.error(`Порт ${SERVER_PORT} уже испльзуется`);
            } else {
                log.error('Ошибка сервера:', err);
            }

            shutdownMongoDB('SERVER_ERROR');
            process.exit(1);
        });
    } catch (err) {
        log.error('Не удалось запустить сервер', err);
        process.exit(1);
    }
};

startServer();
