import { promises as fsp } from 'fs';
import { join } from 'path';
import {
    STORAGE_ROOT,
    PROMO_STORAGE_PATH,
    PRODUCT_STORAGE_PATH,
    ORDER_STORAGE_PATH
} from '../../../config/paths.js';
import log from '../../../utils/logger.js';

export const fsStorageProvider = {
    initStorage: async () => {
        await ensureDir(STORAGE_ROOT);
        await Promise.all([
            ensureDir(PROMO_STORAGE_PATH),
            ensureDir(PRODUCT_STORAGE_PATH),
            ensureDir(ORDER_STORAGE_PATH)
        ]);
    },

    deleteTempFiles: async ({ tempFiles, logCtx }) => {
        const tempFilePaths = tempFiles.map(file => file.path).filter(Boolean);
        await cleanupFiles(tempFilePaths, logCtx);
    },
    
    savePromoImage: async ({ promoId, tempFile }) => {
        const promoDir = join(PROMO_STORAGE_PATH, promoId);
        await ensureDir(promoDir);

        const targetPath = join(promoDir, tempFile.filename);
        await moveFile(tempFile.path, targetPath);
    },

    deletePromoImage: async ({ promoId, filename, logCtx }) => {
        const filePath = join(PROMO_STORAGE_PATH, promoId, filename);
        await cleanupFiles([filePath], logCtx);
    },

    cleanupPromoImage: async ({ promoId, logCtx }) => {
        const promoDir = join(PROMO_STORAGE_PATH, promoId);
        await cleanupDir(promoDir, logCtx);
    },
};

const ensureDir = async (dirPath) => {
    await fsp.mkdir(dirPath, { recursive: true }); // recursive: true - создание промежуточных директорий
};

const moveFile = async (sourcePath, targetPath) => {
    try {
        await fsp.rename(sourcePath, targetPath);
    } catch (err) {
        if (err.code === 'EXDEV') {
            await fsp.copyFile(sourcePath, targetPath);
            await fsp.unlink(sourcePath);
        } else {
            throw err;
        }
    }
};

const cleanupFiles = async (filePaths, logCtx) => {
    if (!filePaths.length) return;
    
    await Promise.all(
        filePaths.map(async (path) => {
            try {
                await fsp.rm(path, { force: true }); // force: true - нет ошибки при отсутствии файла
            } catch (err) {
                log.error(`${logCtx} - Ошибка удаления файла "${path}":`, err);
            }
        })
    );
};

const cleanupDir = async (dirPath, logCtx) => {
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
