import cors from 'cors';
import config from '../config/config.js';

export const sseCorsMiddleware = (req, res, next) => {
    // Для продакшна (https) CORS не нужен
    if (config.env === 'production') {
        return next();
    }

    // Настройки для девелопмента (связь между портами клиента и сервера)
    const corsOptions = {
        origin: `${config.protocol}://${config.host}:${config.clientPort}`,
        methods: ['GET'],
        allowedHeaders: ['Content-Type'],
        credentials: true
    };

    // Запуск стандартного cors мидлвар с этими опциями
    return cors(corsOptions)(req, res, next);
};
