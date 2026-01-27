import express from 'express';
import {
    verifyAuth, verifyUser, verifyRole,
    optionalAuth, optionalUser, optionalRole
} from '../middlewares/authMiddleware.js';
import {
    handleNewsListRequest,
    handleNewsRequest,
    handleNewsCreateRequest,
    handleNewsUpdateRequest,
    handleNewsDeleteRequest
} from '../controllers/newsController.js';

const router = express.Router();

router.get('/', optionalAuth, optionalUser, optionalRole('admin', 'customer'), handleNewsListRequest);
router.get('/:newsId', verifyAuth, verifyUser, verifyRole('admin'), handleNewsRequest);
router.post('/', verifyAuth, verifyUser, verifyRole('admin'), handleNewsCreateRequest);
router.put('/:newsId', verifyAuth, verifyUser, verifyRole('admin'), handleNewsUpdateRequest);
router.delete('/:newsId', verifyAuth, verifyUser, verifyRole('admin'), handleNewsDeleteRequest);

export default router; 
