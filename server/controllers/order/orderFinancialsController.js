import Order from '../../database/models/Order.js';
import { getCustomerOrderDetailsUrl } from '../../config/urls.js';
import * as sseOrderManagement from '../../services/sse/sseOrderManagementService.js';
import {
    orderDotNotationMap,
    generateOrderInvoicePdf,
    checkFinancialsTransactionRecord,
    getFinancialsState,
    getFieldErrors,
    applyOrderFinancials,
    updateCustomerTotalSpent,
    clearOrderOnlineTransaction
} from '../../services/orderService.js';
import {
    createOnlinePayment,
    createOnlineRefunds,
    detectWebhookProvider,
    verifyWebhookAuthenticity,
    normalizeWebhook
} from '../../services/onlineTransactionsService.js';
import { logCriticalEvent } from '../../services/criticalEventService.js';
import { typeCheck, validateInputTypes } from '../../utils/typeValidation.js';
import { runInTransaction } from '../../utils/transaction.js';
import { createAppError, prepareAppErrorData } from '../../utils/errorUtils.js';
import { parseValidationErrors } from '../../utils/errorUtils.js';
import log from '../../utils/logger.js';
import safeSendResponse from '../../utils/safeSendResponse.js';
import { isEqualCurrency, getLastFinancialsEventEntry } from '../../../shared/commonHelpers.js';
import { calculateOrderFinancials, getOrderCardRefundStats } from '../../../shared/calculations.js';
import {
    PAYMENT_METHOD,
    OFFLINE_PAYMENT_METHODS,
    ONLINE_PAYMENT_METHODS,
    REFUND_METHOD,
    OFFLINE_REFUND_METHODS,
    ONLINE_REFUND_METHODS,
    TRANSACTION_TYPE,
    ONLINE_TRANSACTION_STATUS,
    BANK_PROVIDER,
    CARD_ONLINE_PROVIDER,
    ORDER_STATUS,
    ORDER_ACTIVE_STATUSES,
    CASH_ON_RECEIPT_ALLOWED_STATUSES,
    FINANCIALS_EVENT,
    SUCCESSFUL_FINANCIALS_EVENTS,
    REQUEST_STATUS
} from '../../../shared/constants.js';

/// Генерация и загрузка счёта заказа в pdf ///
export const handleOrderInvoicePdfRequest = async (req, res, next) => {
    const dbUser = req.dbUser;
    const orderId = req.params.orderId;

    if (!typeCheck.objectId(orderId)) {
        return safeSendResponse(req, res, 400, { message: 'Неверный формат данных: orderId' });
    }

    try {
        const dbOrder = await Order.findById(orderId).lean();
        const orderLbl = dbOrder?.orderNumber ? `№${dbOrder.orderNumber}` : `(ID: ${orderId})`;
        
        if (!dbOrder) {
            return safeSendResponse(req, res, 404, { message: `Заказ ${orderLbl} не найден` });
        }
        if (dbUser.role === 'customer' && !dbOrder.customerId.equals(dbUser._id)) {
            return safeSendResponse(req, res, 403, {
                message: `Запрещено: заказ ${orderLbl} принадлежит другому клиенту`,
                reason: REQUEST_STATUS.DENIED
            });
        }
        if (dbOrder.currentStatus === ORDER_STATUS.DRAFT) {
            return safeSendResponse(req, res, 409, { message: `Заказ ${orderLbl} не оформлен` });
        }

        const { pdfDoc, filename } = generateOrderInvoicePdf(dbOrder);
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        
        pdfDoc.pipe(res);
        pdfDoc.end();
    } catch (err) {
        next(err);
    }
};

/// Аннулирование записи успешного финансового оффлайн-события в заказе (SEE) ///
export const handleOrderFinancialsEventVoidRequest = async (req, res, next) => {
    const dbUser = req.dbUser;

    // Предварительная проверка формата данных
    const orderId = req.params.orderId;
    const { eventId, voidedNote } = req.body ?? {};

    const inputTypeMap = {
        orderId: { value: orderId, type: 'objectId' },
        eventId: { value: eventId, type: 'objectId', form: true },
        voidedNote: { value: voidedNote, type: 'string', optional: true, form: true },
    };

    const { invalidInputKeys, fieldErrors } = validateInputTypes(inputTypeMap, 'financials');

    if (invalidInputKeys.length > 0) {
        const invalidKeysStr = invalidInputKeys.join(', ');
        return safeSendResponse(req, res, 400, { message: `Неверный формат данных: ${invalidKeysStr}` });
    }
    if (Object.keys(fieldErrors).length > 0) {
        return safeSendResponse(req, res, 422, { message: 'Неверный формат данных', fieldErrors });
    }

    // Работа с базой данных
    try {
        const { orderLbl, eventLbl, updatedOrderData } = await runInTransaction(async (session) => {
            // Поиск заказа и проверка его состояния
            const dbOrder = await Order.findById(orderId).session(session);
            const orderLbl = dbOrder?.orderNumber ? `№${dbOrder.orderNumber}` : `(ID: ${orderId})`;

            if (!dbOrder) {
                return safeSendResponse(req, res, 404, { message: `Заказ ${orderLbl} не найден` });
            }

            const financialsEventHistory = dbOrder.financials.eventHistory;
            const targetFinancialsEventEntry = financialsEventHistory.find(
                entry => entry.eventId.toString() === eventId
            );
            const targetFinEvent = targetFinancialsEventEntry?.event ?? null;
            const eventLbl = `(ID: ${eventId}${targetFinEvent ? `, событие: ${targetFinEvent}` : ''})`;

            if (!targetFinancialsEventEntry) {
                return safeSendResponse(req, res, 404, {
                    message: `Запись ${eventLbl} в истории финансов заказа ${orderLbl} не найдена`
                });
            }
            if (targetFinancialsEventEntry.voided?.flag) {
                return safeSendResponse(req, res, 409, {
                    message: `Запись ${eventLbl} в истории финансов заказа ${orderLbl} уже аннулирована`
                });
            }
            if (!SUCCESSFUL_FINANCIALS_EVENTS.includes(targetFinEvent)) {
                return safeSendResponse(req, res, 409, {
                    message:
                        `Запись ${eventLbl} в истории финансов заказа ${orderLbl} ` +
                        'фиксирует неуспешную попытку и не подлежит аннулированию'
                });
            }

            const method = targetFinancialsEventEntry.action.method;
            const onlineMethods = [...ONLINE_PAYMENT_METHODS, ...ONLINE_REFUND_METHODS];
            const isOnlineMethod = onlineMethods.includes(method);

            if (isOnlineMethod) {
                return safeSendResponse(req, res, 409, {
                    message:
                        `Запись ${eventLbl} в истории финансов заказа ${orderLbl} ` +
                        'зафиксирована платёжной системой и не подлежит аннулированию'
                });
            }

            // Получение текущих значений
            const oldFinancials = calculateOrderFinancials(financialsEventHistory);
            const oldNetPaid = oldFinancials.totalPaid - oldFinancials.totalRefunded;
            const oldFinancialsState = dbOrder.financials.state;
            const oldLastFinancialsEventEntry = getLastFinancialsEventEntry(financialsEventHistory);
            
            const isLastEventEntryVoided = oldLastFinancialsEventEntry.eventId.toString() === eventId;

            // Мутация объекта записи в истории финансовых событий
            targetFinancialsEventEntry.voided = {
                flag: true,
                ...(voidedNote && { note: voidedNote }),
                changedBy: { id: dbUser._id, name: dbUser.name, role: dbUser.role },
                changedAt: new Date()
            };

            // Пересчёт и вычисление новых значений после мутации данных
            const newFinancials = calculateOrderFinancials(financialsEventHistory);
            const newNetPaid = newFinancials.totalPaid - newFinancials.totalRefunded;
            const newFinancialsState = getFinancialsState(
                dbOrder.currentStatus,
                newNetPaid,
                dbOrder.totals.totalAmount,
                financialsEventHistory
            );
            const newLastFinancialsEventEntry = getLastFinancialsEventEntry(financialsEventHistory);

            // Сбор изменений
            const changes = [
                {
                    field: orderDotNotationMap.financialsState,
                    oldValue: oldFinancialsState,
                    newValue: newFinancialsState
                },
                {
                    field: orderDotNotationMap.totalPaid,
                    oldValue: oldFinancials.totalPaid,
                    newValue: Number((newFinancials.totalPaid).toFixed(2))
                },
                {
                    field: orderDotNotationMap.totalRefunded,
                    oldValue: oldFinancials.totalRefunded,
                    newValue: Number((newFinancials.totalRefunded).toFixed(2))
                }
            ].filter(({ oldValue, newValue }) => oldValue !== newValue);

            // Установка изменённых данных
            if (isLastEventEntryVoided) {
                const currentOrderStatusEntry = dbOrder.statusHistory.at(-1);
                const maxActivityAt = Math.max(
                    new Date(currentOrderStatusEntry.changedAt).getTime(),
                    newLastFinancialsEventEntry
                        ? new Date(newLastFinancialsEventEntry.changedAt).getTime()
                        : -Infinity
                );

                dbOrder.lastActivityAt = new Date(maxActivityAt);
            }

            changes.forEach(({ field, newValue }) => {
                dbOrder.set(field, newValue);
            });

            // Сохранение обновлённого заказа со всеми изменениями
            const updatedDbOrder = await dbOrder.save({ session });

            // Обновление общей суммы оплат покупателя при завершении заказа
            if (updatedDbOrder.currentStatus === ORDER_STATUS.COMPLETED) {
                const netPaidDelta = newNetPaid - oldNetPaid;
                await updateCustomerTotalSpent(updatedDbOrder.customerId, netPaidDelta, session, req.logCtx);
            }

            // Формирование данных для SSE-сообщения
            const orderPatches = changes.map(({ field, newValue }) => ({ path: field, value: newValue }));
            const updatedOrderData = {
                orderPatches,
                voidedFinancialsEventEntry: targetFinancialsEventEntry,
                ...(isLastEventEntryVoided && { lastFinancialsEventEntry: newLastFinancialsEventEntry })
            };

            return { orderLbl, eventLbl, updatedOrderData };
        });

        // Отправка SSE-сообщения админам
        const sseMessageData = { orderUpdate: { orderId, updatedOrderData } };
        sseOrderManagement.sendToAllClients(sseMessageData);

        safeSendResponse(req, res, 200, {
            message: `Финансовая запись ${eventLbl} заказа ${orderLbl} успешно аннулирована`
        });
    } catch (err) {
        // Обработка ошибок валидации полей при сохранении в MongoDB
        if (err.name === 'ValidationError') {
            const { unknownFieldError, fieldErrors } = parseValidationErrors(err, 'financials');
            if (unknownFieldError) return next(unknownFieldError);
        
            if (fieldErrors) {
                return safeSendResponse(req, res, 422, { message: 'Некорректные данные', fieldErrors });
            }
        }

        next(err);
    }
};

/// Внесение оплаты за заказ оффлайн-методом (SEE) ///
export const handleOrderOfflinePaymentApplyRequest = async (req, res, next) => {
    const dbUser = req.dbUser;
    const orderId = req.params.orderId;
    const { transaction } = req.body ?? {};
    const {
        method, provider, amount, transactionId, markAsFailed
    } = typeCheck.object(transaction) ? transaction : {};

    const inputTypeMap = {
        orderId: { value: orderId, type: 'objectId' },
        transaction: { value: transaction, type: 'object' },
        method: { value: method, type: 'string', form: true },
        provider: { value: provider, type: 'string', optional: true, form: true },
        amount: { value: amount, type: 'number', form: true },
        transactionId: { value: transactionId, type: 'string', optional: true, form: true },
        markAsFailed: { value: markAsFailed, type: 'boolean', optional: true, form: true }
    };

    const { invalidInputKeys, fieldErrors } = validateInputTypes(inputTypeMap, 'payment');

    if (invalidInputKeys.length > 0) {
        const invalidKeysStr = invalidInputKeys.join(', ');
        return safeSendResponse(req, res, 400, { message: `Неверный формат данных: ${invalidKeysStr}` });
    }
    if (Object.keys(fieldErrors).length > 0) {
        return safeSendResponse(req, res, 422, { message: 'Неверный формат данных', fieldErrors });
    }

    const prepDbFields = {
        method: method.trim(),
        provider: provider?.trim(),
        amount: Number(amount),
        transactionId: transactionId?.trim()
    };
    const invalidFields = [];

    if (!OFFLINE_PAYMENT_METHODS.includes(prepDbFields.method)) {
        invalidFields.push('method');
    }
    if (isEqualCurrency(prepDbFields.amount, 0) || prepDbFields.amount < 0) {
        invalidFields.push('amount');
    }
    if (prepDbFields.method === PAYMENT_METHOD.BANK_TRANSFER) {
        if (!prepDbFields.provider || !Object.values(BANK_PROVIDER).includes(prepDbFields.provider)) {
            invalidFields.push('provider');
        }
        if (!prepDbFields.transactionId) {
            invalidFields.push('transactionId');
        }
        if (markAsFailed === undefined) {
            invalidFields.push('markAsFailed');
        }
    }

    if (invalidFields.length > 0) {
        return safeSendResponse(req, res, 422, {
            message: 'Некорректные данные',
            fieldErrors: getFieldErrors(invalidFields, 'payment')
        });
    }

    try {
        const { orderLbl, updatedOrderData } = await runInTransaction(async (session) => {
            // Поиск заказа и проверка его состояния
            const dbOrder = await Order.findById(orderId).session(session);
            const orderLbl = dbOrder?.orderNumber ? `№${dbOrder.orderNumber}` : `(ID: ${orderId})`;

            if (!dbOrder) {
                throw createAppError(404, `Заказ ${orderLbl} не найден`);
            }

            const currentOrderStatus = dbOrder.currentStatus;

            if (currentOrderStatus === ORDER_STATUS.DRAFT) {
                throw createAppError(409, `Заказ ${orderLbl} не оформлен`);
            }
            if (
                prepDbFields.method === PAYMENT_METHOD.CASH_ON_RECEIPT &&
                !CASH_ON_RECEIPT_ALLOWED_STATUSES.includes(currentOrderStatus)
            ) {
                throw createAppError(403, `Запрещено: заказ ${orderLbl} ещё не принят`);
            }

            const financialsEventHistory = dbOrder.financials.eventHistory;
            const financials = calculateOrderFinancials(financialsEventHistory);

            const netPaid = financials.totalPaid - financials.totalRefunded;
            const totalAmount = dbOrder.totals.totalAmount;

            const isCancelledOrder = currentOrderStatus === ORDER_STATUS.CANCELLED;

            if (!isCancelledOrder && (isEqualCurrency(netPaid, totalAmount) || netPaid > totalAmount)) {
                throw createAppError(403, `Запрещено: заказ ${orderLbl} уже оплачен`);
            }
            if (isCancelledOrder && (isEqualCurrency(netPaid, 0) || netPaid > 0)) {
                throw createAppError(403, `Запрещено: неотрицательный баланс заказа ${orderLbl}`);
            }

            if (prepDbFields.method === PAYMENT_METHOD.BANK_TRANSFER) {
                const isTransactionAlreadyRecorded = checkFinancialsTransactionRecord(
                    financialsEventHistory,
                    prepDbFields.transactionId
                );

                if (isTransactionAlreadyRecorded) {
                    throw createAppError(
                        400,
                        `Операция по транзакции ${prepDbFields.transactionId} ` +
                            `уже произведена для заказа ${orderLbl}`
                    );
                }
            }

            // Вычисление и установка новых значений в заказ (мутация объекта dbOrder)
            const { newNetPaid } = applyOrderFinancials(dbOrder, {
                transactionType: TRANSACTION_TYPE.PAYMENT,
                financials,
                amount: prepDbFields.amount,
                method: prepDbFields.method,
                provider: prepDbFields.provider,
                transactionId: prepDbFields.transactionId,
                markAsFailed,
                actor: dbUser
            });

            // Сохранение обновлённого заказа
            const updatedDbOrder = await dbOrder.save({ session });

            // Обновление общей суммы оплат покупателя, если заказ уже завершён
            if (!markAsFailed && currentOrderStatus === ORDER_STATUS.COMPLETED) {
                const netPaidDelta = newNetPaid - netPaid;
                await updateCustomerTotalSpent(updatedDbOrder.customerId, netPaidDelta, session, req.logCtx);
            }

            // Формирование данных для SSE-сообщения
            const orderPatches = [
                { path: orderDotNotationMap.financialsState, value: updatedDbOrder.financials.state },
                { path: orderDotNotationMap.totalPaid, value: updatedDbOrder.financials.totalPaid }
            ];
            const newFinancialsEventEntry = updatedDbOrder.financials.eventHistory.at(-1).toObject();
            const updatedOrderData = { orderPatches, newFinancialsEventEntry };

            return { orderLbl, updatedOrderData };
        });

        // Отправка SSE-сообщения админам
        const sseMessageData = { orderUpdate: { orderId, updatedOrderData } };
        sseOrderManagement.sendToAllClients(sseMessageData);

        safeSendResponse(req, res, 200, {
            message: `Оплата за заказ ${orderLbl} оффлайн методом успешно внесена`
        });
    } catch (err) {
        if (err.isAppError) {
            return safeSendResponse(req, res, err.statusCode, prepareAppErrorData(err));
        }

        if (err.name === 'ValidationError') {
            const { unknownFieldError, fieldErrors } = parseValidationErrors(err, 'payment');
            if (unknownFieldError) return next(unknownFieldError);
        
            if (fieldErrors) {
                return safeSendResponse(req, res, 422, { message: 'Некорректные данные', fieldErrors });
            }
        }

        next(err);
    }
};

/// Возврат средств за заказ оффлайн-методом (SEE) ///
export const handleOrderOfflineRefundApplyRequest = async (req, res, next) => {
    const dbUser = req.dbUser;
    const orderId = req.params.orderId;
    const { transaction } = req.body ?? {};
    const {
        method, provider, amount, transactionId, markAsFailed, externalReference
    } = typeCheck.object(transaction) ? transaction : {};

    const inputTypeMap = {
        orderId: { value: orderId, type: 'objectId' },
        transaction: { value: transaction, type: 'object' },
        method: { value: method, type: 'string', form: true },
        provider: { value: provider, type: 'string', optional: true, form: true },
        amount: { value: amount, type: 'number', form: true },
        transactionId: { value: transactionId, type: 'string', optional: true, form: true },
        markAsFailed: { value: markAsFailed, type: 'boolean', optional: true, form: true },
        externalReference: { value: externalReference, type: 'string', optional: true, form: true },
    };

    const { invalidInputKeys, fieldErrors } = validateInputTypes(inputTypeMap, 'refund');

    if (invalidInputKeys.length > 0) {
        const invalidKeysStr = invalidInputKeys.join(', ');
        return safeSendResponse(req, res, 400, { message: `Неверный формат данных: ${invalidKeysStr}` });
    }
    if (Object.keys(fieldErrors).length > 0) {
        return safeSendResponse(req, res, 422, { message: 'Неверный формат данных', fieldErrors });
    }

    const prepDbFields = {
        method: method.trim(),
        provider: provider?.trim(),
        amount: Number(amount),
        transactionId: transactionId?.trim(),
        externalReference: externalReference?.trim()
    };
    const invalidFields = [];

    if (!OFFLINE_REFUND_METHODS.includes(prepDbFields.method)) {
        invalidFields.push('method');
    }
    if (isEqualCurrency(prepDbFields.amount, 0) || prepDbFields.amount < 0) {
        invalidFields.push('amount');
    }
    if (prepDbFields.method === REFUND_METHOD.BANK_TRANSFER) {
        if (!prepDbFields.provider || !Object.values(BANK_PROVIDER).includes(prepDbFields.provider)) {
            invalidFields.push('provider');
        }
        if (!prepDbFields.transactionId) {
            invalidFields.push('transactionId');
        }
        if (markAsFailed === undefined) {
            invalidFields.push('markAsFailed');
        }
    }

    if (invalidFields.length > 0) {
        return safeSendResponse(req, res, 422, {
            message: 'Некорректные данные',
            fieldErrors: getFieldErrors(invalidFields, 'refund')
        });
    }

    try {
        const { orderLbl, updatedOrderData } = await runInTransaction(async (session) => {
            // Поиск заказа и проверка его состояния
            const dbOrder = await Order.findById(orderId).session(session);
            const orderLbl = dbOrder?.orderNumber ? `№${dbOrder.orderNumber}` : `(ID: ${orderId})`;

            if (!dbOrder) {
                throw createAppError(404, `Заказ ${orderLbl} не найден`);
            }

            const currentOrderStatus = dbOrder.currentStatus;

            if (currentOrderStatus === ORDER_STATUS.DRAFT) {
                throw createAppError(409, `Заказ ${orderLbl} не оформлен`);
            }

            const financialsEventHistory = dbOrder.financials.eventHistory;
            const financials = calculateOrderFinancials(financialsEventHistory);

            const netPaid = financials.totalPaid - financials.totalRefunded;
            const totalAmount = dbOrder.totals.totalAmount;

            const isCancelledOrder = currentOrderStatus === ORDER_STATUS.CANCELLED;

            if (!isCancelledOrder && (isEqualCurrency(netPaid, totalAmount) || netPaid < totalAmount)) {
                throw createAppError(403, `Запрещено: заказ ${orderLbl} не переплачен`);
            }
            if (isCancelledOrder && (isEqualCurrency(netPaid, 0) || netPaid < 0)) {
                throw createAppError(403, `Запрещено: нулевой или отрицательный баланс заказа ${orderLbl}`);
            }

            if (prepDbFields.method === REFUND_METHOD.BANK_TRANSFER) {
                const isTransactionAlreadyRecorded = checkFinancialsTransactionRecord(
                    financialsEventHistory,
                    prepDbFields.transactionId
                );

                if (isTransactionAlreadyRecorded) {
                    throw createAppError(
                        400,
                        `Операция по транзакции ${prepDbFields.transactionId} ` +
                            `уже произведена для заказа ${orderLbl}`
                    );
                }
            }

            // Вычисление и установка новых значений в заказ (мутация объекта dbOrder)
            const { newNetPaid } = applyOrderFinancials(dbOrder, {
                transactionType: TRANSACTION_TYPE.REFUND,
                financials,
                amount: prepDbFields.amount,
                method: prepDbFields.method,
                provider: prepDbFields.provider,
                transactionId: prepDbFields.transactionId,
                markAsFailed,
                externalReference: prepDbFields.externalReference,
                actor: dbUser
            });

            // Сохранение обновлённого заказа
            const updatedDbOrder = await dbOrder.save({ session });

            // Обновление общей суммы оплат покупателя, если заказ уже завершён
            if (!markAsFailed && currentOrderStatus === ORDER_STATUS.COMPLETED) {
                const netPaidDelta = newNetPaid - netPaid;
                await updateCustomerTotalSpent(updatedDbOrder.customerId, netPaidDelta, session, req.logCtx);
            }

            // Формирование данных для SSE-сообщения
            const orderPatches = [
                { path: orderDotNotationMap.financialsState, value: updatedDbOrder.financials.state },
                { path: orderDotNotationMap.totalRefunded, value: updatedDbOrder.financials.totalRefunded }
            ];
            const newFinancialsEventEntry = updatedDbOrder.financials.eventHistory.at(-1).toObject();
            const updatedOrderData = { orderPatches, newFinancialsEventEntry };
        
            return { orderLbl, updatedOrderData };
        });

        // Отправка SSE-сообщения админам
        const sseMessageData = { orderUpdate: { orderId, updatedOrderData } };
        sseOrderManagement.sendToAllClients(sseMessageData);

        safeSendResponse(req, res, 200, {
            message: `Возврат средств по заказу ${orderLbl} оффлайн методом выполнен`
        });
    } catch (err) {
        if (err.isAppError) {
            return safeSendResponse(req, res, err.statusCode, prepareAppErrorData(err));
        }

        if (err.name === 'ValidationError') {
            const { unknownFieldError, fieldErrors } = parseValidationErrors(err, 'refund');
            if (unknownFieldError) return next(unknownFieldError);
        
            if (fieldErrors) {
                return safeSendResponse(req, res, 422, { message: 'Некорректные данные', fieldErrors });
            }
        }

        next(err);
    }
};

/// Создание онлайн платежа для банковской карты через YooKassa ///
export const handleOrderOnlinePaymentCreateRequest = async (req, res, next) => {
    const dbUser = req.dbUser;
    const orderId = req.params.orderId;
    const { paymentToken, transaction } = req.body ?? {};
    const { provider, amount } = typeCheck.object(transaction) ? transaction : {};

    const inputTypeMap = {
        orderId: { value: orderId, type: 'objectId' },
        paymentToken: { value: paymentToken, type: 'string' },
        transaction: { value: transaction, type: 'object' },
        provider: { value: provider, type: 'string', form: true },
        amount: { value: amount, type: 'number', form: true }
    };

    const { invalidInputKeys, fieldErrors } = validateInputTypes(inputTypeMap, 'financials');

    if (invalidInputKeys.length > 0) {
        const invalidKeysStr = invalidInputKeys.join(', ');
        return safeSendResponse(req, res, 400, { message: `Неверный формат данных: ${invalidKeysStr}` });
    }
    if (Object.keys(fieldErrors).length > 0) {
        return safeSendResponse(req, res, 422, { message: 'Неверный формат данных', fieldErrors });
    }

    if (!paymentToken.trim()) {
        return safeSendResponse(req, res, 400, { message: 'Отсутствует платёжный токен' });
    }

    const amountNum = Number(amount);
    const invalidFields = [];

    if (!Object.values(CARD_ONLINE_PROVIDER).includes(provider)) {
        invalidFields.push('provider');
    }
    if (isEqualCurrency(amountNum, 0) || amountNum < 0) {
        invalidFields.push('amount');
    }

    if (invalidFields.length > 0) {
        return safeSendResponse(req, res, 422, {
            message: 'Некорректные данные',
            fieldErrors: getFieldErrors(invalidFields, 'payment')
        });
    }

    try {
        // Поиск заказа и проверка его состояния
        const dbOrder = await Order.findById(orderId);
        const orderNumber = dbOrder?.orderNumber;
        const orderLbl = orderNumber ? `№${orderNumber}` : `(ID: ${orderId})`;

        if (!dbOrder) {
            return safeSendResponse(req, res, 404, { message: `Заказ ${orderLbl} не найден` });
        }
        if (!dbOrder.customerId.equals(dbUser._id)) {
            return safeSendResponse(req, res, 403, {
                message: `Запрещено: заказ ${orderLbl} принадлежит другому клиенту`,
                reason: REQUEST_STATUS.DENIED
            });
        }
        if (!ORDER_ACTIVE_STATUSES.includes(dbOrder.currentStatus)) {
            return safeSendResponse(req, res, 409, { message: `Заказ ${orderLbl} не активен` });
        }

        const currentTransaction = dbOrder.financials.currentOnlineTransaction;

        if (currentTransaction) {
            switch (currentTransaction.status) {
                case ONLINE_TRANSACTION_STATUS.INIT:
                    return safeSendResponse(req, res, 409, {
                        message:
                            `Онлайн-транзакция для заказа ${orderLbl} уже инициирована, ` +
                            `тип: ${currentTransaction.type}`
                    });

                case ONLINE_TRANSACTION_STATUS.PROCESSING:
                    return safeSendResponse(req, res, 409, {
                        message:
                            `Онлайн-транзакция для заказа ${orderLbl} создана и обрабатывается, ` +
                            `тип: ${currentTransaction.type}`
                    });

                default:
                    throw new Error(`Неизвестный статус онлайн-транзакции: ${currentTransaction.status}`);
            }
        }

        const financials = calculateOrderFinancials(dbOrder.financials.eventHistory);
        const netPaid = financials.totalPaid - financials.totalRefunded;

        const totalAmount = dbOrder.totals.totalAmount;

        if (isEqualCurrency(netPaid, totalAmount) || netPaid > totalAmount) {
            return safeSendResponse(req, res, 403, {
                message: `Запрещено: заказ ${orderLbl} уже оплачен`
            });
        }
        
        const newNetPaid = netPaid + amountNum;

        if (!isEqualCurrency(newNetPaid, totalAmount) && newNetPaid > totalAmount) {
            return safeSendResponse(req, res, 403, {
                message: `Запрещено: заказ ${orderLbl} переплачен`
            });
        }

        // Атомарный апдейт заказа со статусом ожидания создания платежа через YooKassa
        let updatedDbOrder = await Order.findOneAndUpdate(
            { _id: orderId, 'financials.currentOnlineTransaction': { $exists: false } },
            {
                $set: {
                    'financials.currentOnlineTransaction': {
                        type: TRANSACTION_TYPE.PAYMENT,
                        providers: [provider.toUpperCase()],
                        status: ONLINE_TRANSACTION_STATUS.INIT,
                        amount: amountNum,
                        startedAt: new Date()
                    }
                }
            },
            { new: true }
        );
        
        if (!updatedDbOrder) {
            return safeSendResponse(req, res, 409, { message: `Конфликт состояния заказа ${orderLbl}` });
        }

        // Формирование и отправка SSE-сообщения с созданными данными по онлайн-транзакции в заказе
        const orderPatches = [
            {
                path: orderDotNotationMap.currentOnlineTransaction,
                value: updatedDbOrder.financials.currentOnlineTransaction
            }
        ];
        const updatedOrderData = { orderPatches };

        const sseMessageData = { orderUpdate: { orderId, updatedOrderData } };
        sseOrderManagement.sendToAllClients(sseMessageData);

        // Создание онлайн-платежа
        const paymentResult = await createOnlinePayment(provider, {
            paymentToken,
            amount: amountNum,
            currency: 'RUB',
            returnUrl: getCustomerOrderDetailsUrl(orderNumber, orderId),
            description: `Оплата заказа ${orderLbl}`,
            orderId,
            orderNumber,
            customerId: updatedDbOrder.customerId.toString(),
            provider
        });

        // Обработка ошибки создания онлайн-оплаты
        if (paymentResult.error) {
            log.error(`Ошибка создания транзакции оплаты для заказа ${orderLbl}:`, paymentResult.error);

            // Откат создания данных онлайн-транзакции в заказе
            await clearOrderOnlineTransaction(orderId);

            // Формирование и отправка SSE-сообщения с удалёнными данными по онлайн-транзакции
            const orderPatches = [{ path: orderDotNotationMap.currentOnlineTransaction, value: undefined }];
            const updatedOrderData = { orderPatches };

            const sseMessageData = { orderUpdate: { orderId, updatedOrderData } };
            sseOrderManagement.sendToAllClients(sseMessageData);

            return safeSendResponse(req, res, 500, {
                message: `По заказу ${orderLbl} онлайн оплата не создана`
            });
        }

        // Атомарный апдейт заказа с обновлёнными данными об онлайн-оплате
        updatedDbOrder = await Order.findOneAndUpdate(
            { _id: orderId, 'financials.currentOnlineTransaction.status': ONLINE_TRANSACTION_STATUS.INIT },
            {
                $set: {
                    'financials.currentOnlineTransaction.status': ONLINE_TRANSACTION_STATUS.PROCESSING,
                    'financials.currentOnlineTransaction.transactionIds': [paymentResult.paymentId],
                    ...(paymentResult.confirmationUrl && {
                        'financials.currentOnlineTransaction.confirmationUrl': paymentResult.confirmationUrl
                    })
                }
            },
            { new: true }
        );

        // Формирование и отправка SSE-сообщения с обновлёнными данными по онлайн-транзакции в заказе
        if (updatedDbOrder) {
            const orderPatches = [
                {
                    path: orderDotNotationMap.currentOnlineTransaction,
                    value: updatedDbOrder.financials.currentOnlineTransaction
                }
            ];
            const updatedOrderData = { orderPatches };
    
            const sseMessageData = { orderUpdate: { orderId, updatedOrderData } };
            sseOrderManagement.sendToAllClients(sseMessageData);
        }

        // Отправка ответа клиенту
        safeSendResponse(req, res, 200, {
            message: `Оплата за заказ ${orderLbl} картой онлайн обрабатывается`,
            confirmationUrl: paymentResult.confirmationUrl ?? null
        });
    } catch (err) {
        next(err);
    }
};

/// Создание возвратов для банковских карт заказа через YooKassa ///
export const handleOrderOnlineRefundsCreateRequest = async (req, res, next) => {
    const orderId = req.params.orderId;

    if (!typeCheck.objectId(orderId)) {
        return safeSendResponse(req, res, 400, { message: 'Неверный формат данных: orderId' });
    }

    try {
        // Поиск заказа и проверка его состояния
        const dbOrder = await Order.findById(orderId);
        const orderLbl = dbOrder?.orderNumber ? `№${dbOrder.orderNumber}` : `(ID: ${orderId})`;

        if (!dbOrder) {
            return safeSendResponse(req, res, 404, { message: `Заказ ${orderLbl} не найден` });
        }

        const currentOrderStatus = dbOrder.currentStatus;

        if (currentOrderStatus === ORDER_STATUS.DRAFT) {
            return safeSendResponse(req, res, 409, { message: `Заказ ${orderLbl} не оформлен` });
        }

        const currentTransaction = dbOrder.financials.currentOnlineTransaction;

        if (currentTransaction) {
            switch (currentTransaction.status) {
                case ONLINE_TRANSACTION_STATUS.INIT:
                    return safeSendResponse(req, res, 409, {
                        message:
                            `Онлайн-транзакция для заказа ${orderLbl} уже инициирована, ` +
                            `тип: ${currentTransaction.type}`
                    });

                case ONLINE_TRANSACTION_STATUS.PROCESSING:
                    return safeSendResponse(req, res, 409, {
                        message:
                            `Онлайн-транзакция для заказа ${orderLbl} создана и обрабатывается, ` +
                            `тип: ${currentTransaction.type}`
                    });

                default:
                    throw new Error(`Неизвестный статус онлайн-транзакции: ${currentTransaction.status}`);
            }
        }

        const financialsEventHistory = dbOrder.financials.eventHistory;
        const financials = calculateOrderFinancials(financialsEventHistory);

        const netPaid = financials.totalPaid - financials.totalRefunded;
        const totalAmount = dbOrder.totals.totalAmount;

        const isCancelledOrder = currentOrderStatus === ORDER_STATUS.CANCELLED;

        if (!isCancelledOrder && (isEqualCurrency(netPaid, totalAmount) || netPaid < totalAmount)) {
            return safeSendResponse(req, res, 403, {
                message: `Запрещено: заказ ${orderLbl} не переплачен`
            });
        }
        if (isCancelledOrder && (isEqualCurrency(netPaid, 0) || netPaid < 0)) {
            return safeSendResponse(req, res, 403, {
                message: `Запрещено: нулевой или отрицательный баланс заказа ${orderLbl}`
            });
        }

        // Сбор заданий и провайдеров по оплатам, которые нужно вернуть, и подсчёт общей суммы возврата
        const {
            refundablePayments: refundTasks,
            refundableProviders: refundProviders,
            availableCardRefundAmount: totalRefundAmount
        } = getOrderCardRefundStats(financialsEventHistory);

        if (!refundTasks.length) {
            return safeSendResponse(req, res, 409, {
                message: `По заказу ${orderLbl} нет доступных для автовозврата оплат картами`
            });
        }

        const newNetPaid = netPaid - totalRefundAmount;

        if (!isEqualCurrency(newNetPaid, 0) && newNetPaid < 0) {
            return safeSendResponse(req, res, 403, {
                message: `Запрещено: избыточный возврат средств по заказу ${orderLbl}`
            });
        }

        // Атомарный апдейт заказа со статусом подготовки создания онлайн-транзакции
        let updatedDbOrder = await Order.findOneAndUpdate(
            { _id: orderId, 'financials.currentOnlineTransaction': { $exists: false } },
            {
                $set: {
                    'financials.currentOnlineTransaction': {
                        type: TRANSACTION_TYPE.REFUND,
                        providers: refundProviders.map(provider => provider.toUpperCase()),
                        status: ONLINE_TRANSACTION_STATUS.INIT,
                        amount: totalRefundAmount,
                        startedAt: new Date()
                    }
                }
            },
            { new: true }
        );
        
        if (!updatedDbOrder) {
            return safeSendResponse(req, res, 409, { message: `Конфликт состояния заказа ${orderLbl}` });
        }

        // Формирование и отправка SSE-сообщения с созданными данными по онлайн-транзакции в заказе
        const orderPatches = [
            {
                path: orderDotNotationMap.currentOnlineTransaction,
                value: updatedDbOrder.financials.currentOnlineTransaction
            }
        ];
        const updatedOrderData = { orderPatches };

        const sseMessageData = { orderUpdate: { orderId, updatedOrderData } };
        sseOrderManagement.sendToAllClients(sseMessageData);

        // Группирование заданий по провайдерам
        const refundTasksByProvider = new Map(); // provider => [task, ...]

        refundTasks.forEach(task => {
            const provider = task.action.provider;
            if (!refundTasksByProvider.has(provider)) {
                refundTasksByProvider.set(provider, []);
            }
            refundTasksByProvider.get(provider).push(task);
        });

        // Создание онлайн-возвратов по каждому провайдеру
        const refundParams = {
            currency: 'RUB',
            description: `Возврат средств по заказу ${orderLbl}`,
            orderId,
            orderNumber: updatedDbOrder.orderNumber,
            customerId: updatedDbOrder.customerId.toString()
        };
        const allRefundIds = [];
        
        for (const [provider, providerTasks] of refundTasksByProvider.entries()) {
            const refundResult = await createOnlineRefunds(provider, providerTasks, refundParams);

            allRefundIds.push(...refundResult.refundIds);
    
            refundResult.errors.forEach(({ task, reason }) => {
                log.error(
                    `Ошибка создания транзакции возврата для заказа ${orderLbl} ` +
                    `по оплате ${task.action.transactionId}:`, reason
                );
            });
        }
        
        // Обработка ситуации, когда не создалось ни одного успешного возврата
        if (!allRefundIds.length) {
            // Откат создания данных онлайн-транзакции в заказе
            await clearOrderOnlineTransaction(orderId);

            // Формирование и отправка SSE-сообщения с удалёнными данными по онлайн-транзакции
            const orderPatches = [{ path: orderDotNotationMap.currentOnlineTransaction, value: undefined }];
            const updatedOrderData = { orderPatches };

            const sseMessageData = { orderUpdate: { orderId, updatedOrderData } };
            sseOrderManagement.sendToAllClients(sseMessageData);

            return safeSendResponse(req, res, 500, {
                message: `По заказу ${orderLbl} не создано ни одного возврата`
            });
        }

        // Атомарный апдейт заказа с обновлёнными данными об онлайн-транзакции
        updatedDbOrder = await Order.findOneAndUpdate(
            { _id: orderId, 'financials.currentOnlineTransaction.status': ONLINE_TRANSACTION_STATUS.INIT },
            {
                $set: {
                    'financials.currentOnlineTransaction.status': ONLINE_TRANSACTION_STATUS.PROCESSING,
                    'financials.currentOnlineTransaction.transactionIds': allRefundIds
                }
            },
            { new: true }
        );

        // Формирование и отправка SSE-сообщения с обновлёнными данными по онлайн-транзакции
        if (updatedDbOrder) {
            const orderPatches = [
                {
                    path: orderDotNotationMap.currentOnlineTransaction,
                    value: updatedDbOrder.financials.currentOnlineTransaction
                }
            ];
            const updatedOrderData = { orderPatches };

            const sseMessageData = { orderUpdate: { orderId, updatedOrderData } };
            sseOrderManagement.sendToAllClients(sseMessageData);
        }

        // Отправка ответа клиенту
        safeSendResponse(req, res, 200, {
            message: `Автовозврат средств по заказу ${orderLbl} на карты онлайн обрабатывается`
        });
    } catch (err) {
        next(err);
    }
};

/// Обработка уведомления (вебхука) от YooKassa об онлайн-оплате или возврате на карту ///
export const handleWebhook = async (req, res, next) => {
    console.log(req.body);

    // Определение провайдера по заголовку
    const provider = detectWebhookProvider(req);

    if (!provider) {
        return safeSendResponse(req, res, 200, { message: 'Неизвестный провайдер' });
    }

    // Проверка подписи заголовка
    const isValidSignature = verifyWebhookAuthenticity(provider, req);

    if (!isValidSignature) {
        return safeSendResponse(req, res, 200, { message: '' });
    }

    // Нормализация данных в теле запроса
    const normalizedWebhook = normalizeWebhook(provider, req.body);

    if (!normalizedWebhook) {
        return safeSendResponse(req, res, 200, { message: 'Игнорирование события' });
    }

    // Проверка критических данных вебхука
    const {
        orderId, transactionId, amount, transactionType, originalPaymentId, markAsFailed
    } = normalizedWebhook;
    const logContext = `${req.logCtx} [WEBHOOK ${provider.toUpperCase()}]`;

    if (
        !typeCheck.objectId(orderId) ||
        !typeCheck.string(transactionId) ||
        !transactionId ||
        isNaN(amount)
    ) {
        logCriticalEvent({
            logContext,
            category: 'financials',
            reason: 'Отсутствуют ключевые данные в вебхуке от платёжной системы',
            data: normalizedWebhook
        });
        return safeSendResponse(req, res, 200, { message: 'Битые или отсутствующие данные' });
    }

    try {
        const { updatedOrderData } = await runInTransaction(async (session) => {
            // Поиск заказа и проверка его состояния
            const dbOrder = await Order.findById(orderId).session(session);
            const orderLbl = dbOrder?.orderNumber ? `№${dbOrder.orderNumber}` : `(ID: ${orderId})`;

            if (!dbOrder) {
                throw createAppError(404, `Заказ ${orderLbl} не найден`);
            }

            const currentOrderStatus = dbOrder.currentStatus;

            if (currentOrderStatus === ORDER_STATUS.DRAFT) {
                logCriticalEvent({
                    logContext,
                    category: 'financials',
                    reason:
                        `Получен вебхук от платёжной системы для заказа ${orderLbl} ` +
                        `в статусе ${ORDER_STATUS.DRAFT}`,
                    data: normalizedWebhook
                });
                throw createAppError(409, `Заказ ${orderLbl} не оформлен`);
            }

            const financialsEventHistory = dbOrder.financials.eventHistory;
            const isTransactionAlreadyRecorded = checkFinancialsTransactionRecord(
                financialsEventHistory,
                transactionId
            );

            if (isTransactionAlreadyRecorded) {
                throw createAppError(
                    400,
                    `Операция по транзакции ${transactionId} уже произведена для заказа ${orderLbl}`
                );
            }

            // Вычисление и установка новых значений в заказ (мутация объекта dbOrder)
            const financials = calculateOrderFinancials(financialsEventHistory);
            const method = transactionType === TRANSACTION_TYPE.PAYMENT
                ? PAYMENT_METHOD.CARD_ONLINE
                : REFUND_METHOD.CARD_ONLINE;
            
            const { newNetPaid } = applyOrderFinancials(dbOrder, {
                transactionType,
                financials,
                amount,
                method,
                transactionId,
                originalPaymentId,
                markAsFailed,
                actor: { name: 'SYSTEM', role: 'system' }
            });

            // Обработка данных об онлайн-оплате в заказе
            const currentOnlineTx = dbOrder.financials.currentOnlineTransaction;

            if (currentOnlineTx) {
                const isIdExpected = currentOnlineTx.transactionIds?.includes(transactionId);

                if (isIdExpected) {
                    // Удаление ID из массива
                    dbOrder.financials.currentOnlineTransaction.transactionIds = 
                        currentOnlineTx.transactionIds.filter(id => id !== transactionId);

                    // Удаление данных онлайн транзакции, если массив опустел
                    if (!dbOrder.financials.currentOnlineTransaction.transactionIds.length) {
                        dbOrder.financials.currentOnlineTransaction = undefined;
                    }
                } else {
                    // Удаление данных онлайн транзакции, массив изначально пуст (статус INIT)
                    dbOrder.financials.currentOnlineTransaction = undefined;
                }
            }

            // Сохранение обновлённого заказа
            const updatedDbOrder = await dbOrder.save({ session });

            // Обновление общей суммы оплат покупателя, если заказ уже завершён
            if (!markAsFailed && currentOrderStatus === ORDER_STATUS.COMPLETED) {
                const netPaid = financials.totalPaid - financials.totalRefunded;
                const netPaidDelta = newNetPaid - netPaid;
                await updateCustomerTotalSpent(updatedDbOrder.customerId, netPaidDelta, session, req.logCtx);
            }

            // Формирование данных для SSE-сообщения
            const orderPatches = [
                { path: orderDotNotationMap.financialsState, value: updatedDbOrder.financials.state },
                { path: orderDotNotationMap.totalPaid, value: updatedDbOrder.financials.totalPaid },
                { path: orderDotNotationMap.totalRefunded, value: updatedDbOrder.financials.totalRefunded }
            ];
            const newFinancialsEventEntry = updatedDbOrder.financials.eventHistory.at(-1).toObject();
            const updatedOrderData = { orderPatches, newFinancialsEventEntry };

            return { updatedOrderData };
        });

        // Отправка SSE-сообщения админам
        const sseMessageData = { orderUpdate: { orderId, updatedOrderData } };
        sseOrderManagement.sendToAllClients(sseMessageData);

        // Отправка успешного ответа YooKassa
        safeSendResponse(req, res, 200);
    } catch (err) {
        if (err.isAppError) {
            return safeSendResponse(req, res, 200); // Не повторять уведомления с вебхуком
        }

        next(err);
    }
};
