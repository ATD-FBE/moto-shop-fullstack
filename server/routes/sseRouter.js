import express from 'express';
import { verifyAuth, verifyUser, verifyRole } from '../middlewares/authMiddleware.js';
import {
    handleSseNotificationsRequest,
    handleSseOrderManagementRequest
} from '../controllers/sseController.js';

const router = express.Router();

router.get('/notifications', verifyAuth, verifyUser, verifyRole('customer'), handleSseNotificationsRequest);
router.get('/order-management', verifyAuth, verifyUser, verifyRole('admin'), handleSseOrderManagementRequest);

export default router;
