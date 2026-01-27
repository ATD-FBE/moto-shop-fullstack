import cron from 'node-cron';
import Order from '../../database/models/Order.js';
import { releaseReservedProducts } from '../checkoutService.js';
import log from '../../utils/logger.js';
import { runInTransaction } from '../../utils/transaction.js';
import { ORDER_STATUS } from '../../../shared/constants.js';

const LOG_CTX = '[CRON EXPIRED ORDER DRAFT CLEANER]';

export const startExpiredOrderDraftCleaner = () => {
    log.info(`${LOG_CTX} Очистка просроченных черновиков заказов запущена`);

    cron.schedule(
        '*/3 * * * *', // Проверка каждые 3 минут
        async () => {
            try {
                await runInTransaction(async (session) => {
                    const expiredOrderDrafts = await Order.find({
                        currentStatus: ORDER_STATUS.DRAFT,
                        expiresAt: { $lte: new Date() }
                    }).session(session);
        
                    if (!expiredOrderDrafts.length) return;
        
                    const reservedOrderItemList = expiredOrderDrafts.flatMap(order => order.items);
                    await releaseReservedProducts(reservedOrderItemList, session);
        
                    const expiredOrderIds = expiredOrderDrafts.map(order => order._id);
                    await Order.deleteMany({ _id: { $in: expiredOrderIds } }).session(session);
                });
            } catch (err) {
                log.error(`${LOG_CTX} Ошибка фонового удаления просроченных черновиков заказа:`, err);
            }
        }
    );
};
