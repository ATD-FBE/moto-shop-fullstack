import express from 'express';
import createMulterConfig from '../utils/multerConfig.js';
import { PRODUCT_STORAGE_PATH } from '../config/paths.js';
import {
    ALLOWED_IMAGE_MIME_TYPES,
    PRODUCT_FILES_LIMIT,
    MAX_PRODUCT_IMAGE_SIZE_MB
} from '../../shared/constants.js';
import {
    verifyAuth, verifyUser, verifyRole,
    optionalAuth, optionalUser, optionalRole
} from '../middlewares/authMiddleware.js';
import {
    handleProductListRequest,
    handleProductRequest,
    handleProductCreateRequest,
    handleProductUpdateRequest,
    handleBulkProductUpdateRequest,
    handleProductDeleteRequest,
    handleBulkProductDeleteRequest
} from '../controllers/productController.js';

const uploadImages = createMulterConfig({
    type: 'array',
    fields: 'images',
    storagePath: PRODUCT_STORAGE_PATH,
    allowedMimeTypes: ALLOWED_IMAGE_MIME_TYPES,
    filesLimit: PRODUCT_FILES_LIMIT,
    maxSizeMB: MAX_PRODUCT_IMAGE_SIZE_MB
});

const router = express.Router();

router.get('/', optionalAuth, optionalUser, optionalRole('admin', 'customer'), handleProductListRequest);
router.get('/:productId', optionalAuth, optionalUser, optionalRole('admin', 'customer'), handleProductRequest);
router.post('/', verifyAuth, verifyUser, verifyRole('admin'), uploadImages, handleProductCreateRequest);
router.put('/:productId', verifyAuth, verifyUser, verifyRole('admin'), uploadImages, handleProductUpdateRequest);
router.patch('/bulk', verifyAuth, verifyUser, verifyRole('admin'), handleBulkProductUpdateRequest);
router.delete('/bulk', verifyAuth, verifyUser, verifyRole('admin'), handleBulkProductDeleteRequest);
router.delete('/:productId', verifyAuth, verifyUser, verifyRole('admin'), handleProductDeleteRequest);

export default router;
