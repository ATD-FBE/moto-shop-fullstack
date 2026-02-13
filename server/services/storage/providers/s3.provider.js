import { promises as fsp } from 'fs';
import { join } from 'path';
import { Upload } from '@aws-sdk/lib-storage';
import { ListObjectsV2Command, DeleteObjectsCommand, CopyObjectCommand } from "@aws-sdk/client-s3";
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
import log from '../../../utils/logger.js';
import { PRODUCT_THUMBNAIL_PRESETS, PRODUCT_THUMBNAIL_SIZES } from '../../../../shared/constants.js';

sharp.cache(false); // Отменить кэширование оригинальных файлов картинок, чтобы они удалялись при ошибке

// Вспомогательная функция для загрузки буфера в S3
const uploadToS3 = async (buffer, key, mimetype) => {
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

    return upload.done();
};

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

        const storageKey = [PROMO_STORAGE_FOLDER, promoId, tempFile.filename].join('/');
        await uploadToS3(tempFile.buffer, storageKey, tempFile.mimetype);
    },

    deletePromoImage: async (promoId, filename, logCtx) => {
        if (!promoId || !filename) return;

        
    },

    cleanupPromoFiles: async (promoId, logCtx) => {
        if (!promoId) return;

        const prefix = `${PROMO_STORAGE_FOLDER}/${promoId}/`;

        try {
            const listCommand = new ListObjectsV2Command({
                Bucket: config.storage.bucket,
                Prefix: prefix
            });

            const listedObjects = await s3Client.send(listCommand);

            if (!listedObjects.Contents || !listedObjects.Contents.length) {
                return;
            }

            const deleteParams = {
                Bucket: config.storage.bucket,
                Delete: {
                    Objects: listedObjects.Contents.map(({ Key }) => ({ Key }))
                }
            };

            await s3Client.send(new DeleteObjectsCommand(deleteParams));
        } catch (err) {
            // Безопасная для потока обработка ошибки
            log.error(`${logCtx} - Ошибка при очистке файлов акции ${promoId} в S3:`, err);
        }
    },

    /// Product ///
    saveProductImages: async (productId, tempFiles = []) => {
        if (!productId || !tempFiles.length) {
            throw new Error('Критические данные отсутствуют или неверны в saveProductImages (s3)');
        }
    
        for (const file of tempFiles) {
            const filename = file.filename;
    
            // Установка пути для оригинального файла и загрузка в хранилище s3
            const originalKey = [
                PRODUCT_STORAGE_FOLDER,
                productId,
                PRODUCT_ORIGINALS_FOLDER,
                filename
            ].join('/');
    
            const originalPromise = uploadToS3(file.buffer, originalKey, file.mimetype);
    
            // Генерация превью через Sharp и параллельная загрузка в хранилище s3
            const thumbnailPromises = PRODUCT_THUMBNAIL_SIZES.map(async (size) => {
                const thumbKey = [
                    PRODUCT_STORAGE_FOLDER,
                    productId,
                    PRODUCT_THUMBNAILS_FOLDER,
                    `${size}px`,
                    filename
                ].join('/');
    
                // Ресайз Sharp возвращает буфер
                const thumbBuffer = await sharp(file.buffer)
                    .resize(size, size, { // Привью в форме квадрата со стороной size
                        fit: 'inside', // Картинка сохраняет пропорции и помещается по центру привью
                        withoutEnlargement: true // Картинка не растягивается в привью, если меньше пресета
                    })
                    .toBuffer();
    
                return uploadToS3(thumbBuffer, thumbKey, file.mimetype);
            });
    
            // Параллельная загрузка всех картинок файла
            await Promise.all([originalPromise, ...thumbnailPromises]);
        }
    },

    deleteProductImages: async (productId, filenames = [], logCtx) => {
        if (!productId || !filenames.length) return;

        
    },

    cleanupProductFiles: async (productId, logCtx) => {
        if (!productId) return;

        
    },

    /// Order ///
    saveOrderItemsImages: async (orderId, orderItems = []) => {
        if (!orderId || !orderItems.length) {
            throw new Error('Критические данные отсутствуют или неверны в saveOrderItemsImages (s3)');
        }

        const thumbImageSize = PRODUCT_THUMBNAIL_PRESETS.small;
    
        const copyPromises = orderItems.map(item => {
            if (!item.imageFilename) return null;

            const sourceKey = [
                config.storage.bucket, // ВАЖНО: CopySource должен включать имя бакета!
                PRODUCT_STORAGE_FOLDER,
                item.productId.toString(),
                PRODUCT_THUMBNAILS_FOLDER,
                `${thumbImageSize}px`,
                item.imageFilename
            ].join('/');

            const destinationKey = [
                ORDER_STORAGE_FOLDER,
                orderId,
                item.imageFilename
            ].join('/');

            return s3Client.send(new CopyObjectCommand({
                Bucket: config.storage.bucket,
                CopySource: encodeURI(sourceKey), // encodeURI на случай пробелов в именах
                Key: destinationKey // Без encodeURI
            }));
        }).filter(Boolean);
    
        await Promise.all(copyPromises);
    },

    deleteOrderItemsImages: async (orderId, filenames = [], logCtx) => {
        if (!orderId || !filenames.length) return;

        
    },

    cleanupOrderFiles: async (orderId, logCtx) => {
        if (!orderId) return;

        
    }
};
