import express from 'express';
import config from '../config/config.js';
import { PROMO_STORAGE_PATH } from '../config/paths.js';
import createMulterConfig from '../utils/multerConfig.js';
import {
    verifyAuth, verifyUser, verifyRole,
    optionalAuth, optionalUser, optionalRole
} from '../middlewares/authMiddleware.js';
import {
    handlePromoListRequest,
    handlePromoRequest,
    handlePromoCreateRequest,
    handlePromoUpdateRequest,
    handlePromoDeleteRequest
} from '../controllers/promoController.js';
import {
    ALLOWED_IMAGE_MIME_TYPES,
    MAX_PROMO_IMAGE_SIZE_MB,
    SERVER_CONSTANTS
} from '../../shared/constants.js';

const { MULTER_MODE } = SERVER_CONSTANTS;

const uploadImage = createMulterConfig({
    type: 'single',
    fields: 'image',
    storageMode: config.storage.multerMode,
    storagePath: config.storage.multerMode === MULTER_MODE.DISK ? PROMO_STORAGE_PATH : null,
    allowedMimeTypes: ALLOWED_IMAGE_MIME_TYPES,
    maxSizeMB: MAX_PROMO_IMAGE_SIZE_MB
});

const router = express.Router();

router.get('/', optionalAuth, optionalUser, optionalRole('admin', 'customer'), handlePromoListRequest);
router.get('/:promoId', verifyAuth, verifyUser, verifyRole('admin'), handlePromoRequest);
router.post('/', verifyAuth, verifyUser, verifyRole('admin'), uploadImage, handlePromoCreateRequest);
router.put('/:promoId', verifyAuth, verifyUser, verifyRole('admin'), uploadImage, handlePromoUpdateRequest);
router.delete('/:promoId', verifyAuth, verifyUser, verifyRole('admin'), handlePromoDeleteRequest);

export default router;
