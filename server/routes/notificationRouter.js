import express from 'express';
import { verifyAuth, verifyUser, verifyRole } from '../middlewares/authMiddleware.js';
import {
    handleNotificationListRequest,
    handleNotificationRequest,
    handleNotificationCreateRequest,
    handleNotificationSendingRequest,
    handleNotificationUpdateRequest,
    handleNotificationDeleteRequest,
    handleNotificationMarkAsReadRequest
} from '../controllers/notificationController.js';

const router = express.Router();

router.get('/', verifyAuth, verifyUser, verifyRole('admin', 'customer'), handleNotificationListRequest);
router.get('/:notificationId', verifyAuth, verifyUser, verifyRole('admin'), handleNotificationRequest);
router.post('/', verifyAuth, verifyUser, verifyRole('admin'), handleNotificationCreateRequest);
router.put('/:notificationId', verifyAuth, verifyUser, verifyRole('admin'), handleNotificationUpdateRequest);
router.patch('/:notificationId/send', verifyAuth, verifyUser, verifyRole('admin'), handleNotificationSendingRequest);
router.patch('/:notificationId/read', verifyAuth, verifyUser, handleNotificationMarkAsReadRequest);
router.delete('/:notificationId', verifyAuth, verifyUser, verifyRole('admin'), handleNotificationDeleteRequest);

export default router;
