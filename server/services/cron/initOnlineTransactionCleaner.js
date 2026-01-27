import cron from 'node-cron';
import Order from '../../database/models/Order.js';
import {
    orderDotNotationMap,
    checkFinancialsTransactionRecord,
    applyOrderFinancials,
    updateCustomerTotalSpent,
    clearOrderOnlineTransaction
} from '../orderService.js';
import {
    fetchExternalTransactions,
    normalizeExternalTransaction
} from '../onlineTransactionsService.js';
import * as sseOrderManagement from '../sse/sseOrderManagementService.js';
import { logCriticalEvent } from '../criticalEventService.js';
import { typeCheck } from '../../utils/typeValidation.js';
import { runInTransaction } from '../../utils/transaction.js';
import log from '../../utils/logger.js';
import { calculateOrderFinancials } from '../../../shared/calculations.js';
import {
    PAYMENT_METHOD,
    REFUND_METHOD,
    TRANSACTION_TYPE,
    ONLINE_TRANSACTION_STATUS,
    ORDER_STATUS,
    SERVER_CONSTANTS
} from '../../../shared/constants.js';

const { ONLINE_TRANSACTION_INIT_EXPIRATION } = SERVER_CONSTANTS;
const expirationMinutes = Math.floor(ONLINE_TRANSACTION_INIT_EXPIRATION / 60 / 1000);
const LOG_CTX = '[CRON ONLINE TRANSACTION CLEANER]';

export const startInitOnlineTransactionCleaner = () => {
    log.info(`${LOG_CTX} Очистка зависших онлайн-транзакций в заказах запущена`);

    cron.schedule(
        //'*/1 * * * *', // Тест каждую минуту
        `*/${expirationMinutes} * * * *`, // Проверка каждые expirationMinutes минут
        async () => {
            const now = Date.now();
            const expirationTime = new Date(now - ONLINE_TRANSACTION_INIT_EXPIRATION);

            console.log('+ cron start');

            try {
                // Поиск зависших транзакций с установленным сроком истечения
                const stuckDbOrders = await Order.find({
                    currentStatus: { $ne: ORDER_STATUS.DRAFT },
                    'financials.currentOnlineTransaction.status': ONLINE_TRANSACTION_STATUS.INIT,
                    'financials.currentOnlineTransaction.startedAt': { $lte: expirationTime }
                });

                console.log(stuckDbOrders);

                if (stuckDbOrders.length === 0) return;

                // Группирование заказов по провайдерам
                const stuckDbOrdersByProvider = groupStuckOrdersByProvider(stuckDbOrders);

                // Поиск и нормализация данных найденных транзакций по каждому провайдеру
                const allNormalizedTransactions = [];

                for (const [provider, providerOrders] of stuckDbOrdersByProvider.entries()) {
                    const fetchedTransactions = await fetchExternalTransactions(provider, providerOrders);
                    if (!fetchedTransactions.length) continue;

                    console.log(fetchedTransactions);

                    fetchedTransactions.forEach(tx => {
                        const normalizedTx = normalizeExternalTransaction(provider, tx);
                        if (normalizedTx) allNormalizedTransactions.push(normalizedTx);
                    });
                }

                console.log(allNormalizedTransactions);
            
                // Создание карты транзакций по ID заказа, где значение - массив всех транзакций для заказа
                const orderTransactionsMap = createOrderTransactionsMap(allNormalizedTransactions);

                console.log(orderTransactionsMap);
                
                // Обработка каждого заказа из списка зависших
                for (const dbOrder of stuckDbOrders) {
                    const orderId = dbOrder._id.toString();
                    
                    try {
                        const foundTransactions = orderTransactionsMap.get(orderId);

                        // Транзакции не найдены => удаление данных онлайн транзакции
                        if (!foundTransactions || !foundTransactions.length) {
                            await clearOrderOnlineTransaction(orderId);
                            continue;
                        }

                        // Транзакции найдены => обработка всех транзакций пачкой
                        await processStuckTransactionGroup(orderId, foundTransactions);
                    } catch (orderErr) {
                        log.error(`${LOG_CTX} Ошибка обработки заказа ${orderId}:`, orderErr);
                    }
                };
                
                log.warn(
                    `${LOG_CTX} Обработано зависших заказов: ${stuckDbOrders.length}, ` +
                    `транзакций найдено: ${allNormalizedTransactions.length}`
                );
            } catch (err) {
                log.error(`${LOG_CTX} Ошибка cron:`, err);
            }
        }
    );
};

const groupStuckOrdersByProvider = (stuckOrders) => {
    const map = new Map(); // provider => [order, ...]

    stuckOrders.forEach(order => {
        const providers = order.financials?.currentOnlineTransaction?.providers;
        if (!providers) return;

        for (const provider of providers) {
            if (!map.has(provider)) {
                map.set(provider, []);
            }
            map.get(provider).push(order);
        }
    });

    return map;
};

const createOrderTransactionsMap = (transactions) => {
    const map = new Map(); // orderId => [{...}, {...}, {...}]
                
    transactions
        .filter(tx => typeCheck.objectId(tx.orderId))
        .forEach(tx => {
            const orderId = tx.orderId;
            if (!map.has(orderId)) {
                map.set(orderId, []);
            }
            map.get(orderId).push(tx);
        });

    return map;
};

const processStuckTransactionGroup = async (orderId, transactionGroup) => {
    const { shouldClearTransaction, updatedOrderData } = await runInTransaction(async (session) => {
        // Обновление данных заказа
        const dbOrder = await Order.findById(orderId).session(session);

        // Проверка, не обработан ли заказ к этому времени
        const currentOnlineTx = dbOrder?.financials.currentOnlineTransaction;

        if (!currentOnlineTx || currentOnlineTx.status !== ONLINE_TRANSACTION_STATUS.INIT) {
            return { shouldClearTransaction: false, updatedOrderData: null };
        }
        if (dbOrder.currentStatus === ORDER_STATUS.DRAFT) {
            logCriticalEvent({
                logContext: LOG_CTX,
                category: 'financials',
                reason:
                    `Найдены онлайн-транзакции для заказа №${dbOrder.orderNumber} ` +
                    `в статусе ${ORDER_STATUS.DRAFT}`,
                data: transactionGroup
            });
            return {
                shouldClearTransaction: true,
                updatedOrderData: {
                    orderPatches: [{
                        path: orderDotNotationMap.currentOnlineTransaction,
                        value: undefined
                    }]
                }
            };
        }
        
        // Обновление данных онлайн транзакции в заказе
        const allTransactionIds = transactionGroup.map(tx => tx.transactionId);
        const confirmTransaction = transactionGroup.find(tx => tx.confirmationUrl);

        currentOnlineTx.status = ONLINE_TRANSACTION_STATUS.PROCESSING;
        currentOnlineTx.transactionIds = allTransactionIds;
        if (confirmTransaction) currentOnlineTx.confirmationUrl = confirmTransaction.confirmationUrl;

        // Поиск и обработка завершённых транзакций
        const financialsEventHistory = dbOrder.financials.eventHistory;
        const initialFinancials = calculateOrderFinancials(financialsEventHistory);
        const initialNetPaid = initialFinancials.totalPaid - initialFinancials.totalRefunded;
        let finalNetPaid = initialNetPaid;
        
        const finishedTransactions = transactionGroup.filter(tx => tx.finished);

        for (const finishedTx of finishedTransactions) {
            const {
                provider, transactionType, transactionId, amount, originalPaymentId, markAsFailed
            } = finishedTx;

            // Проверка критических данных вебхука
            if (!typeCheck.string(transactionId) || !transactionId || isNaN(amount)) {
                logCriticalEvent({
                    logContext,
                    category: 'financials',
                    reason: 'Отсутствуют ключевые данные в транзакции платёжной системы',
                    data: finishedTx
                });
                continue;
            }
            
            // Проверка на дубль в истории (идемпотентность)
            const isTransactionAlreadyRecorded = checkFinancialsTransactionRecord(
                financialsEventHistory,
                transactionId
            );
            if (isTransactionAlreadyRecorded) {
                // Изъятие ID транзакции из массива в данных онлайн транзакции
                currentOnlineTx.transactionIds =
                    currentOnlineTx.transactionIds.filter(id => id !== transactionId);
                continue;
            }

            // Вычисление и установка новых значений в заказ (мутация объекта dbOrder)
            const method = transactionType === TRANSACTION_TYPE.PAYMENT
                ? PAYMENT_METHOD.CARD_ONLINE
                : REFUND_METHOD.CARD_ONLINE;

            const { newNetPaid } = applyOrderFinancials(dbOrder, {
                transactionType,
                financials: calculateOrderFinancials(financialsEventHistory), // Всегда актуальные данные
                amount,
                method,
                provider,
                transactionId,
                originalPaymentId,
                markAsFailed,
                actor: { name: 'SYSTEM', role: 'system' }
            });
            finalNetPaid = newNetPaid;

            // Изъятие ID транзакции из массива в данных онлайн транзакции
            currentOnlineTx.transactionIds =
                currentOnlineTx.transactionIds.filter(id => id !== transactionId);
        }

        // Удаление данных онлайн транзакции, если массив ID транзакций в ожидании опустел
        if (!currentOnlineTx.transactionIds.length) {
            dbOrder.financials.currentOnlineTransaction = undefined;
        }

        // Сохранение обновлённого заказа
        const updatedDbOrder = await dbOrder.save({ session });
        
        // Обновление общей суммы оплат покупателя, если заказ уже завершён
        if (dbOrder.currentStatus === ORDER_STATUS.COMPLETED) {
            const netPaidDelta = finalNetPaid - initialNetPaid;
            await updateCustomerTotalSpent(updatedDbOrder.customerId, netPaidDelta, session, LOG_CTX);
        }

        // Формирование данных для SSE-сообщения (только последняя запись финансовой истории придёт)
        const orderPatches = [
            { path: orderDotNotationMap.financialsState, value: updatedDbOrder.financials.state },
            { path: orderDotNotationMap.totalPaid, value: updatedDbOrder.financials.totalPaid },
            { path: orderDotNotationMap.totalRefunded, value: updatedDbOrder.financials.totalRefunded }
        ];
        const newFinancialsEventEntry = updatedDbOrder.financials.eventHistory.at(-1).toObject();
        const updatedOrderData = { orderPatches, newFinancialsEventEntry };

        return { shouldClearTransaction: false, updatedOrderData };
    });
    
    // Очистка данных онлайн транзакции
    let clearedTransactionCount = 0;

    if (shouldClearTransaction) {
        clearedTransactionCount = await clearOrderOnlineTransaction(orderId);
    }

    // Отправка SSE-сообщения админам
    if (updatedOrderData && (!shouldClearTransaction || clearedTransactionCount > 0)) {
        const sseMessageData = { orderUpdate: { orderId, updatedOrderData } };
        sseOrderManagement.sendToAllClients(sseMessageData);
    }
};
