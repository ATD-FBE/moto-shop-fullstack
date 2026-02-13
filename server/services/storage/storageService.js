import config from '../../config/config.js';
import { fsStorageProvider } from './providers/fs.provider.js';
import { s3StorageProvider } from './providers/s3.provider.js';
import { SERVER_CONSTANTS } from '../../../shared/constants.js';

const { STORAGE_TYPE } = SERVER_CONSTANTS;

let provider;

switch (config.storage.type) {
    case STORAGE_TYPE.FS:
        provider = fsStorageProvider;
        break;
    case STORAGE_TYPE.S3:
        provider = s3StorageProvider;
        break;
    default:
        throw new Error(`Неизвестный тип файлового хранилища: ${config.storage.type}`);
}

export const storageService = {
    supports: provider.supports,
    initStorage: provider.initStorage,
    savePromoImage: provider.savePromoImage,
    deleteTempFiles: provider.deleteTempFiles,
    deletePromoImage: provider.deletePromoImage,
    cleanupPromoFiles: provider.cleanupPromoFiles,
    saveProductImages: provider.saveProductImages,
    deleteProductImages: provider.deleteProductImages,
    cleanupProductFiles: provider.cleanupProductFiles,
    saveOrderItemsImages: provider.saveOrderItemsImages,
    deleteOrderItemsImages: provider.deleteOrderItemsImages,
    cleanupOrderFiles: provider.cleanupOrderFiles
};
