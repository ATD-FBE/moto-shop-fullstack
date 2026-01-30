import express from 'express';
import { verifyAuth, verifyUser, verifyRole } from '../middlewares/authMiddleware.js';
import {
    handleOrderListRequest,
    handleOrderRequest,
    handleOrderItemsAvailabilityRequest,
    handleOrderRepeatRequest,
    handleOrderDetailsUpdateRequest,
    handleOrderItemsUpdateRequest,
    handleOrderStatusUpdateRequest,
    handleOrderInternalNoteUpdateRequest
} from '../controllers/order/orderCoreController.js';
import {
    handleOrderInvoicePdfRequest,
    handleOrderRemainingAmountRequest,
    handleOrderFinancialsEventVoidRequest,
    handleOrderOfflinePaymentApplyRequest,
    handleOrderOfflineRefundApplyRequest,
    handleOrderOnlinePaymentCreateRequest,
    handleOrderOnlineRefundsCreateRequest,
    handleWebhook
} from '../controllers/order/orderFinancialsController.js';

const router = express.Router();

router.get('/', verifyAuth, verifyUser, verifyRole('admin', 'customer'), handleOrderListRequest);
router.get('/:orderId', verifyAuth, verifyUser, verifyRole('admin', 'customer'), handleOrderRequest);
router.get('/:orderId/items/availability', verifyAuth, verifyUser, verifyRole('admin'), handleOrderItemsAvailabilityRequest);
router.get('/:orderId/invoice/pdf', verifyAuth, verifyUser, verifyRole('admin', 'customer'), handleOrderInvoicePdfRequest);
router.get('/:orderId/financials/remaining', verifyAuth, verifyUser, verifyRole('customer'), handleOrderRemainingAmountRequest);
router.post('/webhook', handleWebhook);
router.post('/:orderId/repeat', verifyAuth, verifyUser, verifyRole('customer'), handleOrderRepeatRequest);
router.post('/:orderId/payment/online', verifyAuth, verifyUser, verifyRole('customer'), handleOrderOnlinePaymentCreateRequest);
router.post('/:orderId/refund/online/full', verifyAuth, verifyUser, verifyRole('admin'), handleOrderOnlineRefundsCreateRequest);
router.patch('/:orderId', verifyAuth, verifyUser, verifyRole('admin'), handleOrderDetailsUpdateRequest);
router.patch('/:orderId/items', verifyAuth, verifyUser, verifyRole('admin'), handleOrderItemsUpdateRequest);
router.patch('/:orderId/status', verifyAuth, verifyUser, verifyRole('admin'), handleOrderStatusUpdateRequest);
router.patch('/:orderId/internal-note', verifyAuth, verifyUser, verifyRole('admin'), handleOrderInternalNoteUpdateRequest);
router.patch('/:orderId/financials/events/void', verifyAuth, verifyUser, verifyRole('admin'), handleOrderFinancialsEventVoidRequest);
router.patch('/:orderId/payment/offline', verifyAuth, verifyUser, verifyRole('admin'), handleOrderOfflinePaymentApplyRequest);
router.patch('/:orderId/refund/offline', verifyAuth, verifyUser, verifyRole('admin'), handleOrderOfflineRefundApplyRequest);

export default router;
