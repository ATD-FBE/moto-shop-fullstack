import express from 'express';
import createMulterConfig from '../utils/multerConfig.js';
import { PROMO_STORAGE_PATH } from '../config/paths.js';
import { ALLOWED_IMAGE_MIME_TYPES, MAX_PROMO_IMAGE_SIZE_MB } from '../../shared/constants.js';
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

const uploadImage = createMulterConfig({
    type: 'single',
    fields: 'image',
    storagePath: PROMO_STORAGE_PATH,
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
