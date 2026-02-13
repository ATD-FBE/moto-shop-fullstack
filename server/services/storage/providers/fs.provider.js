import { promises as fsp } from 'fs';
import { join } from 'path';
import sharp from 'sharp';
import {
    STORAGE_ROOT,
    PROMO_STORAGE_PATH,
    PRODUCT_STORAGE_PATH,
    PRODUCT_ORIGINALS_FOLDER,
    PRODUCT_THUMBNAILS_FOLDER,
    ORDER_STORAGE_PATH
} from '../../../config/paths.js';
import log from '../../../utils/logger.js';
import { PRODUCT_THUMBNAIL_PRESETS, PRODUCT_THUMBNAIL_SIZES } from '../../../../shared/constants.js';

sharp.cache(false); // Отменить кэширование оригинальных файлов картинок, чтобы они удалялись при ошибке

export const fsStorageProvider = {
    initStorage: async () => {
        await ensureDir(STORAGE_ROOT);
        await Promise.all([
            ensureDir(PROMO_STORAGE_PATH),
            ensureDir(PRODUCT_STORAGE_PATH),
            ensureDir(ORDER_STORAGE_PATH)
        ]);
        log.info(`Используется локальное файловое хранилище, инициализация выполнена`);
    },

    deleteTempFiles: async (tempFiles = [], logCtx) => {
        const tempFilePaths = tempFiles.map(file => file.path).filter(Boolean);
        await cleanupFiles(tempFilePaths, logCtx);
    },
    
    /// Promo ///
    savePromoImage: async (promoId, tempFile) => {
        if (!promoId || !tempFile) {
            throw new Error('Критические данные отсутствуют или неверны в savePromoImage (fs)');
        }

        const promoDir = join(PROMO_STORAGE_PATH, promoId);
        await ensureDir(promoDir);

        const destPath = join(promoDir, tempFile.filename);
        await moveFile(tempFile.path, destPath);
    },

    deletePromoImage: async (promoId, filename, logCtx) => {
        if (!promoId || !filename) return;

        const filePath = join(PROMO_STORAGE_PATH, promoId, filename);
        await cleanupFiles([filePath], logCtx);
    },

    cleanupPromoFiles: async (promoId, logCtx) => {
        if (!promoId) return;

        const promoDir = join(PROMO_STORAGE_PATH, promoId);
        await cleanupDir(promoDir, logCtx);
    },

    /// Product ///
    saveProductImages: async (productId, tempFiles = []) => {
        if (!productId || !tempFiles.length) {
            throw new Error('Критические данные отсутствуют или неверны в saveProductImages (fs)');
        }
    
        // Создание папок для хранения фотографий товаров
        const productDir = join(PRODUCT_STORAGE_PATH, productId);
        const originalsDir = join(productDir, PRODUCT_ORIGINALS_FOLDER);
        const thumbnailsDir = join(productDir, PRODUCT_THUMBNAILS_FOLDER);

        await ensureDir(originalsDir); // productDir создастся рекурсивно

        for (const size of PRODUCT_THUMBNAIL_SIZES) {
            const thumbImgDir = join(thumbnailsDir, `${size}px`);
            await ensureDir(thumbImgDir); // thumbnailsDir создастся рекурсивно
        }

        // Обработка временных файлов
        for (const file of tempFiles) {
            // Перемещение оригинального файла
            const filename = file.filename;
            const origImagePath = join(originalsDir, filename);
            await moveFile(file.path, origImagePath);
    
            // Генерация превьюшек
            for (const size of PRODUCT_THUMBNAIL_SIZES) {
                const thumbImagePath = join(thumbnailsDir, `${size}px`, filename);

                await sharp(origImagePath)
                    .resize(size, size, { // Привью в форме квадрата со стороной size
                        fit: 'inside', // Картинка сохраняет пропорции и помещается по центру привью
                        withoutEnlargement: true // Картинка не растягивается в привью, если меньше пресета
                    })
                    .toFile(thumbImagePath);
            }
        }
    },

    deleteProductImages: async (productId, filenames = [], logCtx) => {
        if (!productId || !filenames.length) return;

        const productDir = join(PRODUCT_STORAGE_PATH, productId);
        const originalsDir = join(productDir, PRODUCT_ORIGINALS_FOLDER);
        const thumbnailsDir = join(productDir, PRODUCT_THUMBNAILS_FOLDER);

        const filePaths = filenames.flatMap(filename => {
            return [
                join(originalsDir, filename),
                ...PRODUCT_THUMBNAIL_SIZES.map(size => join(thumbnailsDir, `${size}px`, filename))
            ];
        });
        await cleanupFiles(filePaths, logCtx);
    },

    cleanupProductFiles: async (productId, logCtx) => {
        if (!productId) return;

        const productDir = join(PRODUCT_STORAGE_PATH, productId);
        await cleanupDir(productDir, logCtx);
    },

    /// Order ///
    saveOrderItemsImages: async (orderId, orderItems = []) => {
        if (!orderId || !orderItems.length) {
            throw new Error('Критические данные отсутствуют или неверны в saveOrderItemsImages (fs)');
        }

        const orderDir = join(ORDER_STORAGE_PATH, orderId);
        await ensureDir(orderDir);

        const thumbImageSize = PRODUCT_THUMBNAIL_PRESETS.small;

        const copyPromises = orderItems.map(item => {
            if (!item.imageFilename) return null;

            const srcPath = join(
                PRODUCT_STORAGE_PATH,
                item.productId.toString(),
                PRODUCT_THUMBNAILS_FOLDER,
                `${thumbImageSize}px`,
                item.imageFilename
            );
            const destPath = join(orderDir, item.imageFilename);

            return copyFile(srcPath, destPath);
        }).filter(Boolean);

        if (copyPromises.length > 0) {
            await Promise.all(copyPromises);
        } else {
            await cleanupDir(orderDir);
        }
    },

    deleteOrderItemsImages: async (orderId, filenames = [], logCtx) => {
        if (!orderId || !filenames.length) return;

        const filePaths = filenames.map(filename => join(ORDER_STORAGE_PATH, orderId, filename));
        await cleanupFiles(filePaths, logCtx);
    },

    cleanupOrderFiles: async (orderId, logCtx) => {
        if (!orderId) return;

        const orderDir = join(ORDER_STORAGE_PATH, orderId);
        await cleanupDir(orderDir, logCtx);
    }
};

const ensureDir = async (dirPath) => {
    await fsp.mkdir(dirPath, { recursive: true }); // recursive: true - создание промежуточных директорий
};

const moveFile = async (srcPath, destPath) => {
    try {
        await fsp.rename(srcPath, destPath);
    } catch (err) {
        if (err.code === 'EXDEV') { // Ошибка может возникнуть при переносе на разных дисках или разделах
            await fsp.copyFile(srcPath, destPath);
            await fsp.unlink(srcPath);
        } else {
            throw err;
        }
    }
};

const copyFile = async (srcPath, destPath) => {
    await fsp.copyFile(srcPath, destPath);
};

const cleanupFiles = async (filePaths, logCtx = 'Неизвестный запрос') => {
    if (!filePaths.length) return;
    
    await Promise.all(
        filePaths.map(async (path) => {
            try {
                await fsp.rm(path, { force: true }); // force: true - нет ошибки при отсутствии файла
            } catch (err) {
                log.error(`${logCtx} - Не удалось удалить файл "${path}":`, err);
            }
        })
    );
};

const cleanupDir = async (dirPath, logCtx = 'Неизвестный запрос') => {
    if (!dirPath) return;
    
    try {
        await fsp.rm(dirPath, {
            recursive: true, // recursive: true - удаление всего содержимого папки
            force: true      // force: true - нет ошибки при отсутствии папки
        });
    } catch (err) {
        log.error(`${logCtx} - Не удалось удалить папку ${dirPath}:`, err);
    }
};
