import { Upload } from '@aws-sdk/lib-storage';
import {
    ListObjectsV2Command,
    CopyObjectCommand,
    DeleteObjectCommand,
    DeleteObjectsCommand
} from "@aws-sdk/client-s3";
import sharp from 'sharp';
import s3Client from '../../../config/s3Client.js';
import config from '../../../config/config.js';
import {
    PROMO_STORAGE_FOLDER,
    PRODUCT_STORAGE_FOLDER,
    PRODUCT_ORIGINALS_FOLDER,
    PRODUCT_THUMBNAILS_FOLDER,
    ORDER_STORAGE_FOLDER
} from '../../../config/paths.js';
import { checkTimeout } from '../../../middlewares/timeoutMiddleware.js';
import log from '../../../utils/logger.js';
import { PRODUCT_THUMBNAIL_PRESETS, PRODUCT_THUMBNAIL_SIZES } from '../../../../shared/constants.js';

sharp.cache(false); // Отменить кэширование оригинальных файлов картинок, чтобы они удалялись при ошибке

export const s3StorageProvider = {
    initStorage: async () => {
        log.info(`Используется провайдер S3 файлового хранилища, бакет: ${config.storage.bucket}`);
    },

    deleteTempFiles: async () => {},
    
    /// Promo ///
    savePromoImage: async (promoId, tempFile) => {
        if (!promoId || !tempFile || !tempFile.buffer) {
            throw new Error('Критические данные отсутствуют или неверны в savePromoImage (s3)');
        }

        const storageKey = `${PROMO_STORAGE_FOLDER}/${promoId}/${tempFile.filename}`;
        await uploadBufferToS3(tempFile.buffer, storageKey, tempFile.mimetype);
    },

    deletePromoImage: async (promoId, filename, reqCtx) => {
        if (!promoId || !filename) return;

        const storageKey = `${PROMO_STORAGE_FOLDER}/${promoId}/${filename}`;
        await deleteObjectsFromS3(storageKey, reqCtx); // Безопасно
    },

    cleanupPromoFiles: async (promoId, reqCtx) => {
        if (!promoId) return;

        const prefix = `${PROMO_STORAGE_FOLDER}/${promoId}/`; // Обязательно со слэшем в конце
        await cleanupByPrefixFromS3(prefix, reqCtx);
    },

    /// Product ///
    saveProductImages: async (productId, tempFiles = [], req) => {
        if (!productId || !tempFiles.length) {
            throw new Error('Критические данные отсутствуют или неверны в saveProductImages (s3)');
        }

        for (const file of tempFiles) {
            checkTimeout(req);
    
            // Установка пути для оригинального файла и загрузка в хранилище s3
            const originalKey = [
                PRODUCT_STORAGE_FOLDER,
                productId,
                PRODUCT_ORIGINALS_FOLDER,
                file.filename
            ].join('/');
    
            await uploadBufferToS3(file.buffer, originalKey, file.mimetype);
    
            // Генерация превью через Sharp и параллельная загрузка в хранилище s3
            const sharpPipeline = sharp(file.buffer);

            for (const size of PRODUCT_THUMBNAIL_SIZES) {
                checkTimeout(req);

                const thumbKey = [
                    PRODUCT_STORAGE_FOLDER,
                    productId,
                    PRODUCT_THUMBNAILS_FOLDER,
                    `${size}px`,
                    file.filename
                ].join('/');
    
                // Ресайз Sharp возвращает буфер асинхронно
                const thumbBuffer = await sharpPipeline
                    .clone() // Клонирование состояния для каждого размера привью
                    .resize(size, size, { // Привью в форме квадрата со стороной size
                        fit: 'inside', // Картинка сохраняет пропорции и помещается по центру привью
                        withoutEnlargement: true // Картинка не растягивается в привью, если меньше пресета
                    })
                    .toBuffer(); // Запись в буфер

                await uploadBufferToS3(thumbBuffer, thumbKey, file.mimetype);
            }
        }
    },

    deleteProductImages: async (productId, filenames = [], reqCtx) => {
        if (!productId || !filenames.length) return;

        const productPrefix = `${PRODUCT_STORAGE_FOLDER}/${productId}`;
        const originalsPrefix = `${productPrefix}/${PRODUCT_ORIGINALS_FOLDER}`;
        const thumbnailsPrefix = `${productPrefix}/${PRODUCT_THUMBNAILS_FOLDER}`;

        const storageKeys = filenames.flatMap(filename => [
            `${originalsPrefix}/${filename}`,
            ...PRODUCT_THUMBNAIL_SIZES.map(size => `${thumbnailsPrefix}/${size}px/${filename}`)
        ]);

        await deleteObjectsFromS3(storageKeys, reqCtx); // Безопасно
    },

    cleanupProductFiles: async (productId, reqCtx) => {
        if (!productId) return;

        const prefix = `${PRODUCT_STORAGE_FOLDER}/${productId}/`; // Обязательно со слэшем в конце
        await cleanupByPrefixFromS3(prefix, reqCtx);
    },

    /// Order ///
    saveOrderItemsImages: async (orderId, orderItems = [], req) => {
        if (!orderId || !orderItems.length) {
            throw new Error('Критические данные отсутствуют или неверны в saveOrderItemsImages (s3)');
        }

        const thumbImageSize = PRODUCT_THUMBNAIL_PRESETS.small;

        for (const item of orderItems) {
            checkTimeout(req);
            if (!item.imageFilename) continue;
    
            const srcKey = [
                PRODUCT_STORAGE_FOLDER,
                item.productId.toString(),
                PRODUCT_THUMBNAILS_FOLDER,
                `${thumbImageSize}px`,
                item.imageFilename
            ].join('/');
    
            const destKey = [
                ORDER_STORAGE_FOLDER,
                orderId,
                item.imageFilename
            ].join('/');
    
            try {
                await copyObjectInS3(srcKey, destKey);
            } catch (err) {
                if (err.name === 'NoSuchKey' || err.name === 'NotFound' || err.code === 'ENOENT') {
                    log.warn(`[Order ${orderId}] Превью товара ${item.productId} не найдено в источнике`);
                    continue; 
                }

                throw err; 
            }
        }
    },

    deleteOrderItemsImages: async (orderId, filenames = [], reqCtx) => {
        if (!orderId || !filenames.length) return;

        const storageKeys = filenames.map(filename => `${ORDER_STORAGE_FOLDER}/${orderId}/${filename}`);
        await deleteObjectsFromS3(storageKeys, reqCtx); // Безопасно
    },

    cleanupOrderFiles: async (orderId, reqCtx) => {
        if (!orderId) return;

        const prefix = `${ORDER_STORAGE_FOLDER}/${orderId}/`; // Обязательно со слэшем в конце
        await cleanupByPrefixFromS3(prefix, reqCtx);
    }
};

// Вспомогательные функции для работы с S3
const uploadBufferToS3 = async (buffer, key, mimetype) => {
    const upload = new Upload({
        client: s3Client,
        params: {
            Bucket: config.storage.bucket,
            Key: key,
            Body: buffer,
            ContentType: mimetype,
            CacheControl: 'public, max-age=31536000, immutable' // Хранение картинки в кэше брайзера
        },
    });

    await upload.done();
};

const copyObjectInS3 = async (srcKey, destKey) => {
    // ВАЖНО: CopySource для S3 API должен начинаться с имени бакета и слэшем перед ним
    const fullSrcKey = `/${config.storage.bucket}/${srcKey}`;

    const command = new CopyObjectCommand({
        Bucket: config.storage.bucket,
        CopySource: encodeURI(fullSrcKey), // Кодировка спецсимволов
        Key: destKey, // Куда класть (без имени бакета и кодировки)
        MetadataDirective: 'COPY' // Для обновления/сохранения кэш-заголовков
    });

    await s3Client.send(command);
};

const listObjectsByPrefix = async (prefix, reqCtx = 'SYSTEM') => {
    try {
        const listCommand = new ListObjectsV2Command({
            Bucket: config.storage.bucket,
            Prefix: prefix
        });

        const response = await s3Client.send(listCommand);
        return response.Contents?.map(item => item.Key) || [];
    } catch (err) {
        log.error(`${reqCtx} - Ошибка получения списка объектов S3 по префиксу [${prefix}]:`, err);
        return [];
    }
};

const deleteObjectsFromS3 = async (keys = [], reqCtx = 'SYSTEM') => {
    const keysArray = Array.isArray(keys) ? keys : [keys];
    if (!keysArray.length) return;

    try {
        // Удаление одного файла
        if (keysArray.length === 1) {
            const deleteCommand = new DeleteObjectCommand({
                Bucket: config.storage.bucket,
                Key: keysArray[0]
            })

            await s3Client.send(deleteCommand);
            return;
        }

        // Удаление больше одного файла по частям
        const chunkSize = 1000; // Стандартное максимальное количество файлов для одного запроса в S3

        for (let i = 0; i < keysArray.length; i += chunkSize) {
            const chunk = keysArray.slice(i, i + chunkSize);
            
            const deleteCommand = new DeleteObjectsCommand({
                Bucket: config.storage.bucket,
                Delete: {
                    Objects: chunk.map(key => ({ Key: key })),
                    Quiet: true // Без отчёта по каждому файлу, экономия трафика
                }
            });

            await s3Client.send(deleteCommand);
        }
    } catch (err) {
        log.error(`${reqCtx} - Ошибка при удалении объектов S3:`, err);
    }
};

const cleanupByPrefixFromS3 = async (prefix, reqCtx) => {
    const keys = await listObjectsByPrefix(prefix, reqCtx); // Безопасно
    await deleteObjectsFromS3(keys, reqCtx); // Безопасно
};
