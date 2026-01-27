import express from 'express';
import { verifyAuth, verifyUser, verifyRole } from '../middlewares/authMiddleware.js';
import {
    handleOrderDraftRequest,
    handleOrderDraftCreateRequest,
    handleOrderDraftConfirmRequest,
    handleOrderDraftUpdateRequest,
    handleOrderDraftDeleteRequest
} from '../controllers/checkoutController.js';

const router = express.Router();

router.post('/:orderId/prepare', verifyAuth, verifyUser, verifyRole('customer'), handleOrderDraftRequest);
router.post('/:orderId/confirm', verifyAuth, verifyUser, verifyRole('customer'), handleOrderDraftConfirmRequest);
router.post('/', verifyAuth, verifyUser, verifyRole('customer'), handleOrderDraftCreateRequest);
router.patch('/:orderId', verifyAuth, verifyUser, verifyRole('customer'), handleOrderDraftUpdateRequest);
router.delete('/:orderId', verifyAuth, verifyUser, verifyRole('customer'), handleOrderDraftDeleteRequest);

export default router;
