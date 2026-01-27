import express from 'express';
import { verifyAuth, verifyUser, verifyRole } from '../middlewares/authMiddleware.js';
import {
    handleCustomerListRequest,
    handleCustomerOrderListRequest,
    handleCustomerDiscountUpdateRequest,
    handleCustomerBanToggleRequest
} from '../controllers/customerController.js';

const router = express.Router();

router.get('/', verifyAuth, verifyUser, verifyRole('admin'), handleCustomerListRequest);
router.get('/:customerId/orders', verifyAuth, verifyUser, verifyRole('admin'), handleCustomerOrderListRequest);
router.patch('/:customerId/discount', verifyAuth, verifyUser, verifyRole('admin'), handleCustomerDiscountUpdateRequest);
router.patch('/:customerId/ban', verifyAuth, verifyUser, verifyRole('admin'), handleCustomerBanToggleRequest);

export default router;
