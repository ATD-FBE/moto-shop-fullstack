import express from 'express';
import { verifyAuth, verifyUser, verifyRole } from '../middlewares/authMiddleware.js';
import {
    handleCategoryListRequest,
    handleCategoryCreateRequest,
    handleCategoryUpdateRequest,
    handleCategoryDeleteRequest
} from '../controllers/categoryController.js';

const router = express.Router();

router.get('/', handleCategoryListRequest);
router.post('/', verifyAuth, verifyUser, verifyRole('admin'), handleCategoryCreateRequest);
router.put('/:categoryId', verifyAuth, verifyUser, verifyRole('admin'), handleCategoryUpdateRequest);
router.delete('/:categoryId', verifyAuth, verifyUser, verifyRole('admin'), handleCategoryDeleteRequest);

export default router;
