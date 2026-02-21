import mongoose from 'mongoose';
import Category from './models/Category.js';
import config from '../config/config.js';
import log from '../utils/logger.js';
import { UNSORTED_CATEGORY_SLUG } from '../../shared/constants.js';

const createUnsortedCategory = async () => {
    let unsortedCat = await Category.findOne({ slug: UNSORTED_CATEGORY_SLUG });

    if (!unsortedCat) {
        const maxOrderCategory = await Category.findOne({ parent: null }).sort('-order').limit(1);
        const unsortedOrder = maxOrderCategory ? maxOrderCategory.order + 1 : 0;
        
        unsortedCat = await Category.create({
            name: 'Неотсортированные товары',
            slug: UNSORTED_CATEGORY_SLUG,
            order: unsortedOrder,
            restricted: true
        });

        log.info(`Категория товаров "${unsortedCat.name}" успешно создана`);
    } else {
        log.info(`Категория товаров "${unsortedCat.name}" уже существует`);
    }
};

export const connectMongoDB = async () => {
    try {
        await mongoose.connect(config.databaseUrl);
        await createUnsortedCategory();
        log.info('MongoDB подключён');
    } catch (err) {
        log.error('Ошибка подключения MongoDB:', err);
        throw err;
    }
};

export const shutdownMongoDB = async (signal) => {
    log.info(`Сигнал ${signal} получен. Отключение MongoDB...`);

    try {
        await mongoose.disconnect();
        log.info('Соединение с MongoDB закрыто');
    } catch (err) {
        log.error('Ошибка закрытия соединения с MongoDB:', err);
    } finally {
        const errors = ['uncaughtException', 'unhandledRejection', 'SERVER_ERROR'];
        process.exit(errors.includes(signal) ? 1 : 0);
    }
};
