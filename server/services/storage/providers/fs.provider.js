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
import { checkTimeout } from '../../../middlewares/timeoutMiddleware.js';
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

    deleteTempFiles: async (tempFiles = [], reqCtx) => {
        const tempFilesArray = Array.isArray(tempFiles) ? tempFiles : [tempFiles];
        if (!tempFilesArray.length) return;

        const tempFilePaths = tempFilesArray.map(file => file?.path).filter(Boolean);
        await cleanupFiles(tempFilePaths, reqCtx);
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

    deletePromoImage: async (promoId, filename, reqCtx) => {
        if (!promoId || !filename) return;

        const filePath = join(PROMO_STORAGE_PATH, promoId, filename);
        await cleanupFiles(filePath, reqCtx);
    },

    cleanupPromoFiles: async (promoId, reqCtx) => {
        if (!promoId) return;

        const promoDir = join(PROMO_STORAGE_PATH, promoId);
        await cleanupDir(promoDir, reqCtx);
    },

    /// Product ///
    saveProductImages: async (productId, tempFiles = [], req) => {
        if (!productId || !tempFiles.length) {
            throw new Error('Критические данные отсутствуют или неверны в saveProductImages (fs)');
        }
    
        // Создание папок для хранения фотографий товаров
        const productDir = join(PRODUCT_STORAGE_PATH, productId);
        const originalsDir = join(productDir, PRODUCT_ORIGINALS_FOLDER);
        const thumbnailsDir = join(productDir, PRODUCT_THUMBNAILS_FOLDER);

        await Promise.all([
            ensureDir(originalsDir),
            ...PRODUCT_THUMBNAIL_SIZES.map(size => ensureDir(join(thumbnailsDir, `${size}px`)))
            // productDir и thumbnailsDir создадутся рекурсивно
        ]);

        // Обработка временных файлов
        for (const file of tempFiles) {
            checkTimeout(req);

            // Перемещение оригинального файла
            const filename = file.filename;
            const origImagePath = join(originalsDir, filename);
            await moveFile(file.path, origImagePath);
    
            // Генерация превьюшек
            const sharpPipeline = sharp(origImagePath);

            for (const size of PRODUCT_THUMBNAIL_SIZES) {
                checkTimeout(req);

                const thumbImagePath = join(thumbnailsDir, `${size}px`, filename);

                await sharpPipeline
                    .clone() // Клонирование состояния для каждого размера привью
                    .resize(size, size, { // Привью в форме квадрата со стороной size
                        fit: 'inside', // Картинка сохраняет пропорции и помещается по центру привью
                        withoutEnlargement: true // Картинка не растягивается в привью, если меньше пресета
                    })
                    .toFile(thumbImagePath);
            }
        }
    },

    deleteProductImages: async (productId, filenames = [], reqCtx) => {
        if (!productId || !filenames.length) return;

        const productDir = join(PRODUCT_STORAGE_PATH, productId);
        const originalsDir = join(productDir, PRODUCT_ORIGINALS_FOLDER);
        const thumbnailsDir = join(productDir, PRODUCT_THUMBNAILS_FOLDER);

        const filePaths = filenames.flatMap(filename => [
            join(originalsDir, filename),
            ...PRODUCT_THUMBNAIL_SIZES.map(size => join(thumbnailsDir, `${size}px`, filename))
        ]);

        await cleanupFiles(filePaths, reqCtx);
    },

    cleanupProductFiles: async (productId, reqCtx) => {
        if (!productId) return;

        const productDir = join(PRODUCT_STORAGE_PATH, productId);
        await cleanupDir(productDir, reqCtx);
    },

    /// Order ///
    saveOrderItemsImages: async (orderId, orderItems = [], req) => {
        if (!orderId || !orderItems.length) {
            throw new Error('Критические данные отсутствуют или неверны в saveOrderItemsImages (fs)');
        }

        const orderDir = join(ORDER_STORAGE_PATH, orderId);
        const thumbImageSize = PRODUCT_THUMBNAIL_PRESETS.small;
        let isOrderDirExist = false;

        for (const item of orderItems) {
            checkTimeout(req);
            if (!item.imageFilename) continue;

            if (!isOrderDirExist) {
                await ensureDir(orderDir);
                isOrderDirExist = true;
            }

            const srcPath = join(
                PRODUCT_STORAGE_PATH,
                item.productId.toString(),
                PRODUCT_THUMBNAILS_FOLDER,
                `${thumbImageSize}px`,
                item.imageFilename
            );
            const destPath = join(orderDir, item.imageFilename);

            try {
                await copyFile(srcPath, destPath);
            } catch (err) {
                if (err.code === 'ENOENT') {
                    log.warn(`[Order ${orderId}] Превью товара ${item.productId} не найдено в источнике`);
                    continue; 
                }

                throw err; 
            }
        }
    },

    deleteOrderItemsImages: async (orderId, filenames = [], reqCtx) => {
        if (!orderId || !filenames.length) return;

        const filePaths = filenames.map(filename => join(ORDER_STORAGE_PATH, orderId, filename));
        await cleanupFiles(filePaths, reqCtx);
    },

    cleanupOrderFiles: async (orderId, reqCtx) => {
        if (!orderId) return;

        const orderDir = join(ORDER_STORAGE_PATH, orderId);
        await cleanupDir(orderDir, reqCtx);
    }
};

// Вспомогательные функции для работы с FS
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

const cleanupFiles = async (paths = [], reqCtx = 'SYSTEM') => {
    const pathsArray = Array.isArray(paths) ? paths : [paths];
    if (!pathsArray.length) return;
    
    await Promise.all(
        pathsArray.map(async (filePath) => {
            try {
                await fsp.rm(filePath, { force: true }); // force: true - нет ошибки при отсутствии файла
            } catch (err) {
                log.error(`${reqCtx} - Не удалось удалить файл "${filePath}":`, err);
            }
        })
    );
};

const cleanupDir = async (dirPath, reqCtx = 'SYSTEM') => {
    if (!dirPath) return;
    
    try {
        await fsp.rm(dirPath, {
            recursive: true, // recursive: true - удаление всего содержимого папки
            force: true      // force: true - нет ошибки при отсутствии папки
        });
    } catch (err) {
        log.error(`${reqCtx} - Не удалось удалить папку ${dirPath}:`, err);
    }
};
