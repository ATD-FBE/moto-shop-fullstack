import express from 'express';
import { verifyAuth, verifyUser, verifyRole } from '../middlewares/authMiddleware.js';
import {
    handleCartItemListRequest,
    handleGuestCartItemListRequest,
    handleCartItemRestoreRequest,
    handleCartItemUpdateRequest,
    handleCartWarningsFixRequest,
    handleCartItemRemoveRequest,
    handleCartClearRequest
} from '../controllers/cartController.js';

const router = express.Router();

router.get('/', verifyAuth, verifyUser, verifyRole('customer'), handleCartItemListRequest);
router.post('/guest', handleGuestCartItemListRequest);
router.post('/items/restore/:productId', verifyAuth, verifyUser, verifyRole('customer'), handleCartItemRestoreRequest);
router.put('/items/:productId', verifyAuth, verifyUser, verifyRole('customer'), handleCartItemUpdateRequest);
router.patch('/warnings', verifyAuth, verifyUser, verifyRole('customer'), handleCartWarningsFixRequest);
router.delete('/items/:productId', verifyAuth, verifyUser, verifyRole('customer'), handleCartItemRemoveRequest);
router.delete('/clear', verifyAuth, verifyUser, verifyRole('customer'), handleCartClearRequest);

export default router;
