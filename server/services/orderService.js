import { join } from 'path';
import PdfPrinter from 'pdfmake';
import numberToWordsRuPkg from 'number-to-words-ru';
import User from '../database/models/User.js';
import Order from '../database/models/Order.js';
import { applyProductBulkUpdate } from './productService.js';
import { ORDER_STORAGE_FOLDER, SERVER_ROOT, STORAGE_URL_PATH } from '../config/paths.js';
import { logCriticalEvent } from './criticalEventService.js';
import { getLastFinancialsEventEntry, isEqualCurrency } from '../../shared/commonHelpers.js';
import { fieldErrorMessages } from '../../shared/fieldRules.js';
import {
    ORDER_MODEL_TYPE,
    DELIVERY_METHOD,
    PAYMENT_METHOD,
    REFUND_METHOD,
    ORDER_STATUS,
    ORDER_STATUS_CONFIG,
    FINANCIALS_STATE,
    FINANCIALS_EVENT,
    TRANSACTION_TYPE
} from '../../shared/constants.js';
import { COMPANY_DETAILS } from '../../shared/company.js';

const { convert: convertNumberToWordsRu } = numberToWordsRuPkg;

export const orderDotNotationMap = {
    // Totals
    subtotalAmount: 'totals.subtotalAmount',
    totalSavings: 'totals.totalSavings',
    totalAmount: 'totals.totalAmount',

    // Customer info
    firstName: 'customerInfo.firstName',
    lastName: 'customerInfo.lastName',
    middleName: 'customerInfo.middleName',
    email: 'customerInfo.email',
    phone: 'customerInfo.phone',
  
    // Delivery
    deliveryMethod: 'delivery.deliveryMethod',
    allowCourierExtra: 'delivery.allowCourierExtra',
    region: 'delivery.shippingAddress.region',
    district: 'delivery.shippingAddress.district',
    city: 'delivery.shippingAddress.city',
    street: 'delivery.shippingAddress.street',
    house: 'delivery.shippingAddress.house',
    apartment: 'delivery.shippingAddress.apartment',
    postalCode: 'delivery.shippingAddress.postalCode',
    shippingCost: 'delivery.shippingCost',
  
    // Financials
    defaultPaymentMethod: 'financials.defaultPaymentMethod',
    financialsState: 'financials.state',
    totalPaid: 'financials.totalPaid',
    totalRefunded: 'financials.totalRefunded',
    eventHistory: 'financials.eventHistory',
    currentOnlineTransaction: 'financials.currentOnlineTransaction',
  
    // Notes
    customerComment: 'customerComment',
    internalNote: 'internalNote'
};

export const prepareOrderData = (dbOrder, {
    inList = true,
    managed = false,
    details = true,
    viewerRole
} = {}) => ({
    id: dbOrder._id,
    orderNumber: dbOrder.orderNumber,
    confirmedAt: dbOrder.confirmedAt,
    ...(inList && !managed && { lastActivityAt: dbOrder.lastActivityAt }),
    statusHistory: prepareHistoryLogs(dbOrder.statusHistory, {
        type: 'order',
        latestSummary: inList || !managed
    }),
    totals: {
        ...(!inList && {
            subtotalAmount: dbOrder.totals.subtotalAmount,
            totalSavings: dbOrder.totals.totalSavings
        }),
        totalAmount: dbOrder.totals.totalAmount
    },
    ...(details
        ? { items: dbOrder.items.map(item => prepareOrderItem(item, {
            orderId: dbOrder._id.toString(),
            inList
        })) }
        : { totalItems: dbOrder.items.length }),
    ...(details && {
        customerInfo: {
            ...dbOrder.customerInfo,
            ...(!inList && {
                ...(managed && { customerId: dbOrder.customerId._id }),
                login: dbOrder.customerId.name,
                registrationEmail: dbOrder.customerId.email
            })
        }
    }),
    delivery: {
        deliveryMethod: dbOrder.delivery.deliveryMethod,
        allowCourierExtra: dbOrder.delivery.allowCourierExtra,
        ...(details && { shippingAddress: dbOrder.delivery.shippingAddress }),
        ...((managed || details) && { shippingCost: dbOrder.delivery.shippingCost })
    },
    financials: {
        defaultPaymentMethod: dbOrder.financials.defaultPaymentMethod,
        state: dbOrder.financials.state,
        totalPaid: dbOrder.financials.totalPaid,
        totalRefunded: dbOrder.financials.totalRefunded,
        eventHistory: prepareHistoryLogs(dbOrder.financials.eventHistory, {
            type: 'financials',
            latestSummary: !managed
        }),
        currentOnlineTransaction: prepareCurrentOnlineTransaction(
            dbOrder.financials.currentOnlineTransaction,
            { inList, viewerRole }
        )
    },
    ...(managed && {
        customerComment: dbOrder.customerComment,
        internalNote: dbOrder.internalNote,
        ...(!inList && { auditLog: prepareHistoryLogs(dbOrder.auditLog) })
    })
});

const prepareCurrentOnlineTransaction = (currentOnlineTx, { inList, viewerRole }) => {
    if (!currentOnlineTx) return undefined;

    const transactionType = currentOnlineTx.type;
    const canSeeConfirmation =
        (viewerRole === 'customer' && transactionType === TRANSACTION_TYPE.PAYMENT && !inList) ||
        (viewerRole === 'admin' && transactionType === TRANSACTION_TYPE.REFUND && !inList);

    return {
        type: transactionType,
        ...(!inList && { providers: currentOnlineTx.providers }),
        ...(!inList && { status: currentOnlineTx.status }),
        ...(!inList && { amount: currentOnlineTx.amount }),
        ...(canSeeConfirmation && { confirmationUrl: currentOnlineTx.confirmationUrl }),
    };
};

const prepareOrderItem = (item, { orderId, inList }) => ({
    productId: item.productId,
    image: prepareOrderItemImage(orderId, item.imageFilename),
    sku: item.sku,
    name: item.name,
    brand: item.brand,
    quantity: item.quantity,
    unit: item.unit,
    appliedDiscount: item.appliedDiscount,
    finalUnitPrice: item.finalUnitPrice,
    totalPrice: item.totalPrice,
    ...(!inList && {
        originalUnitPrice: item.originalUnitPrice,
        appliedDiscountSource: item.appliedDiscountSource
    })
});

const prepareOrderItemImage = (orderId, filename) => {
    if (!filename) return undefined; // Опциональная картинка
    return [STORAGE_URL_PATH, ORDER_STORAGE_FOLDER, orderId, filename].join('/');
};

const prepareHistoryLogs = (history = [], { type, latestSummary = false } = {}) => {
    switch (type) {
        case 'order': {
            const currentEntry = history.at(-1);

            if (currentEntry?.status !== ORDER_STATUS.CANCELLED) {
                return latestSummary
                    ? currentEntry ? [summarizeOrderStatusEntry(currentEntry)] : []
                    : history;
            }

            const lastActiveStatus = getLastActiveStatus(history);

            return latestSummary
                ? currentEntry ? [summarizeOrderStatusEntry(currentEntry, lastActiveStatus)] : []
                : history.map(e => e.status === ORDER_STATUS.CANCELLED ? { ...e, lastActiveStatus } : e);
        }

        case 'financials': {
            if (latestSummary) {
                const currentEntry = getLastFinancialsEventEntry(history);
                return currentEntry ? [summarizeFinancialsEventEntry(currentEntry)] : [];
            }
            return history;
        }

        default:
            return latestSummary ? history.slice(-1) : history;
    }
};

export const getLastActiveStatus = (statusHistory) =>
    statusHistory.filter(entry => ORDER_STATUS_CONFIG[entry.status]?.active).at(-1)?.status;

const summarizeOrderStatusEntry = (entry, lastActiveStatus) => ({
    status: entry.status,
    changedAt: entry.changedAt,
    lastActiveStatus
});

const summarizeFinancialsEventEntry = (entry) => ({
    event: entry.event,
    action: { amount: entry.action.amount },
    changedAt: entry.changedAt
});

export const prepareShippingCost = (deliveryMethod, allowCourierExtra) =>
    deliveryMethod === DELIVERY_METHOD.COURIER && !allowCourierExtra
        ? 0
        : deliveryMethod === DELIVERY_METHOD.SELF_PICKUP
            ? undefined
            : null;

export const generateOrderInvoicePdf = (dbOrder) => {
    // Подготовка данных
    const dbOrderItemList = dbOrder.items || [];
    const totalOrderItems = dbOrderItemList.length;
    const normalizedOrderItemList = dbOrderItemList.map((item, idx) => ({
        no: idx + 1,
        sku: item.sku || '—',
        title: item.name + (item.brand ? ` «${item.brand}»` : ''),
        qty: item.quantity,
        unit: item.unit,
        unitPrice: item.finalUnitPrice,
        lineTotal: item.totalPrice
    }));

    const dbCustomerInfo = dbOrder.customerInfo || {};
    const customerFullName = [
        dbCustomerInfo.lastName,
        dbCustomerInfo.firstName,
        dbCustomerInfo.middleName ?? null // Опционально
    ].filter(Boolean).join(' ') || '—';

    const totalAmount =
        dbOrder.totals?.totalAmount ??
        normalizedOrderItemList.reduce((acc, item) => acc + item.lineTotal, 0);
    const formattedTotalAmount = fmtCurrency(totalAmount);

    const totalAmountText = `Всего позиций: ${totalOrderItems}, на сумму: ${formattedTotalAmount} RUB`;

    const totalAmountInWords = convertNumberToWordsRu(totalAmount, {
        currency: 'rub',
        convertNumberToWords: {
            integer: true,
            fractional: true,
        },
        showCurrency: {
            integer: true,
            fractional: true,
        },
    });

    // Заполнение документа
    const docDefinition = {
        pageSize: 'A4',
        pageMargins: [40, 60, 40, 60],
        defaultStyle: { font: 'Roboto', fontSize: 10 },
        styles: {
            mainHeader: { fontSize: 16, bold: true, margin: [0, 0, 0, 4] },
            blockHeader: { fontSize: 11, bold: true, margin: [0, 0, 0, 1] },
            tableHeader: { bold: true, fontSize: 10, color: 'black' },
            medium: { font: 'RobotoMedium', fontSize: 10 },
            small: { fontSize: 9 }
        },
        content: [
            // Header
            { text: `«${COMPANY_DETAILS.shopName}»`, style: 'mainHeader', alignment: 'right' },
            { text: 'Счёт на оплату заказа', style: 'medium', fontSize: 12, alignment: 'right' },
            { text: `Номер: ${dbOrder.orderNumber}`, alignment: 'right' },
            { text: `От: ${fmtDate(dbOrder.confirmedAt)}`, alignment: 'right', style: 'small' },
            { text: '\n\n' },

            // Shop Info
            { text: 'Поставщик:', style: 'blockHeader' },
            { text: COMPANY_DETAILS.companyName, style: 'medium' },
            { text: `Адрес: ${COMPANY_DETAILS.displayAddress}`, style: 'small' },
            { text: `Тел: ${COMPANY_DETAILS.phone}`, style: 'small' },
            { text: `Email: ${COMPANY_DETAILS.emails.info}`, style: 'small' },
            { text: '\n' },

            // Customer Info
            { text: 'Покупатель:', style: 'blockHeader' },
            { text: customerFullName, style: 'medium' },
            { text: `Тел.: ${dbCustomerInfo.phone || '—'}`, style: 'small' },
            { text: `Email: ${dbCustomerInfo.email || '—'}`, style: 'small' },
            { text: '\n\n' },

            // OrderList Table
            {
                table: {
                    widths: ['auto', 'auto', '*', 'auto', 'auto', 'auto', 'auto'],
                    heights: (rowIndex) => rowIndex === 0 ? 24 : undefined,
                    body: [
                        [
                            { text: '№', style: 'tableHeader', alignment: 'right' },
                            { text: 'Артикул', style: 'tableHeader' },
                            { text: 'Наименование товара', style: 'tableHeader', alignment: 'center' },
                            { text: 'Количество', style: 'tableHeader', colSpan: 2, alignment: 'center' },
                            {},
                            { text: 'Цена', style: 'tableHeader', alignment: 'right' },
                            { text: 'Сумма', style: 'tableHeader', alignment: 'right' }
                        ],
                        ...normalizedOrderItemList.map(item => [
                            { text: item.no.toString(), alignment: 'right' },
                            item.sku,
                            item.title,
                            { text: item.qty.toString(), alignment: 'center' },
                            { text: item.unit, alignment: 'center' },
                            { text: fmtCurrency(item.unitPrice), alignment: 'right' },
                            { text: fmtCurrency(item.lineTotal), alignment: 'right' }
                        ])
                    ]
                },
                layout: {
                    hLineWidth: () => 0.3, // Толщина горизонтальных линий
                    vLineWidth: () => 0.3, // Толщина вертикальных линий
                }
            },
            { text: '\n' },

            // Totals
            {
                columns: [
                    { width: '*', text: '' },
                    {
                        width: 150,
                        table: {
                            widths: ['*', 'auto'],
                            body: [
                                [
                                    { text: { text: 'Итого:', bold: true } },
                                    { text: { text: formattedTotalAmount, bold: true }, alignment: 'right' }
                                ],
                                [
                                    { text: { text: 'Без НДС:', bold: true } },
                                    { text: { text: '—', bold: true }, alignment: 'right' }
                                ]
                            ]
                        },
                        layout: 'noBorders'
                    }
                ]
            },
            { text: '\n\n' },
            { text: totalAmountText },
            { text: [{ text: 'Сумма прописью: ' }, { text: totalAmountInWords, italics: true }]},
            { text: '\n\n' },

            // Bank Details
            { text: 'Банковские реквизиты:', style: 'blockHeader' },
            {
                columns: [
                    {
                        width: '*',
                        stack: [
                            { text: `Получатель: ${COMPANY_DETAILS.companyName}` },
                            { text: `ИНН: ${COMPANY_DETAILS.inn}` },
                            { text: `ОГРН: ${COMPANY_DETAILS.ogrn}` },
                            { text: `Юр. адрес: ${COMPANY_DETAILS.legalAddress}` }
                        ]
                    },
                    {
                        width: '40%',
                        stack: [
                            { text: `Банк: ${COMPANY_DETAILS.bank.name}`, alignment: 'right' },
                            { text: `БИК: ${COMPANY_DETAILS.bank.bik}`, alignment: 'right' },
                            { text: `Р/с: ${COMPANY_DETAILS.bank.rs}`, alignment: 'right' },
                            { text: `К/с: ${COMPANY_DETAILS.bank.ks}`, alignment: 'right' }
                        ]
                    }
                ]
            }
        ],

        // Вывод номера страницы
        footer: (currentPage, pageCount) => {
            if (pageCount === 1) return null;
            return { text: `Страница ${currentPage} из ${pageCount}`, alignment: 'center', fontSize: 8 };
        }
    };

    // Подключение шрифтов к экземпляру PdfPrinter
    const fonts = {
        Roboto: {
            normal: join(SERVER_ROOT, 'pdf', 'fonts', 'Roboto-Regular.ttf'),
            bold: join(SERVER_ROOT, 'pdf', 'fonts', 'Roboto-Bold.ttf'),
            italics: join(SERVER_ROOT, 'pdf', 'fonts', 'Roboto-Italic.ttf')
        },
        RobotoMedium: {
            normal: join(SERVER_ROOT, 'pdf', 'fonts', 'Roboto-Medium.ttf')
        }
    };
    const printer = new PdfPrinter(fonts);

    // Создание pdf документа с данными
    const pdfDoc = printer.createPdfKitDocument(docDefinition);
    const filename = `invoice_${dbOrder.orderNumber}.pdf`;

    return { pdfDoc, filename };
};

const fmtDate = (date) => {
    const dateObj = new Date(date);
    return isNaN(dateObj.getTime()) ? '—' : dateObj.toLocaleDateString('ru-RU');
};

const fmtCurrency = (amount) => {
    if (typeof amount !== 'number' || isNaN(amount)) return '—';
    return amount.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export const getFinancialsState = (orderStatus, netPaid, totalAmount, eventHistory) => {
    // Отменённый заказ
    if (orderStatus === ORDER_STATUS.CANCELLED) {
        if (isEqualCurrency(netPaid, 0)) {
            const wasPayment = checkFinancialsPaymentRecord(eventHistory);
            return wasPayment ? FINANCIALS_STATE.REFUNDED : FINANCIALS_STATE.VOIDED;
        }
        if (netPaid < 0) {
            return FINANCIALS_STATE.OVER_REFUNDED;
        }
        return FINANCIALS_STATE.REFUND_PENDING; // netPaid > 0
    }

    // Активный/завершённый заказ
    if (isEqualCurrency(netPaid, 0)) {
        return FINANCIALS_STATE.PAID_PENDING;
    }
    if (netPaid < 0) {
        return FINANCIALS_STATE.PAID_NEGATIVE;
    }
    if (isEqualCurrency(netPaid, totalAmount)) {
        return FINANCIALS_STATE.PAID;
    }
    if (netPaid < totalAmount) {
        return FINANCIALS_STATE.PAID_PARTIAL;
    }
    return FINANCIALS_STATE.OVERPAID; // netPaid > totalAmount
};

// Проверка существования успешной оплаты в истории финансовых событий заказа
const checkFinancialsPaymentRecord = (eventHistory) =>
    eventHistory.some(entry => !entry.voided?.flag && entry.event === FINANCIALS_EVENT.PAYMENT_SUCCESS);

// Проверка существования ID транзакции в истории финансовых событий заказа
export const checkFinancialsTransactionRecord = (history, transactionId) =>
    history.some(entry => !entry.voided?.flag && entry.action.transactionId === transactionId);

export const getOrderTransitionData = (deliveryMethod, currentOrderStatus, stepDelta = 1) => {
    const orderStatusSteps = Object.entries(ORDER_STATUS_CONFIG)
        .filter(([_, cfg]) =>
            cfg.step &&
            (
                cfg.step.deliveryMethods.includes('all') ||
                cfg.step.deliveryMethods.includes(deliveryMethod)
            )
        )
        .sort((a, b) => a[1].step.order - b[1].step.order)
        .map(([status, cfg]) => ({ status, ...cfg.step }));
    const currentStepIdx = orderStatusSteps.findIndex(step => step.status === currentOrderStatus);

    return {
        newOrderStatus: orderStatusSteps[currentStepIdx + stepDelta]?.status ?? currentOrderStatus,
        rollbackAllowed: orderStatusSteps[currentStepIdx]?.rollbackAllowed ?? false
    };
};

export const returnProductsToStore = async (orderItemList, session) => {
    await applyProductBulkUpdate(orderItemList, 'return', session);
};

export const getFieldErrors = (invalidFields, entityType) => {
    return Object.fromEntries(
        invalidFields.map(field => [
            field,
            fieldErrorMessages[entityType]?.[field]?.mismatch ||
                fieldErrorMessages[entityType]?.[field]?.default ||
                fieldErrorMessages.DEFAULT
        ])
    );
};

export const applyOrderFinancials = (dbOrder, {
    transactionType,
    financials,
    amount,
    method,
    provider, // Для онлайн-оплаты/возврата и банковского перевода оффлайн
    transactionId, // Для онлайн-оплаты/возврата и банковского перевода оффлайн
    originalPaymentId, // Для онлайн возврата на карту
    markAsFailed,
    failureReason, // Для онлайн-оплаты/возврата и банковского перевода оффлайн
    externalReference, // Для оффлайн возврата на карту
    createdAt, // Для онлайн-оплаты/возврата
    actor
}) => {
    const isPayment = transactionType === TRANSACTION_TYPE.PAYMENT;
    const isRefund = transactionType === TRANSACTION_TYPE.REFUND;

    if (!isPayment && !isRefund) {
        throw new Error(`Некорректный тип транзакции: ${transactionType}`);
    }

    let { totalPaid: newTotalPaid, totalRefunded: newTotalRefunded } = financials;
    let financialsEvent;

    if (isPayment) {
        if (!markAsFailed) {
            newTotalPaid += amount;
            financialsEvent = FINANCIALS_EVENT.PAYMENT_SUCCESS;
        } else {
            financialsEvent = FINANCIALS_EVENT.PAYMENT_FAILED;
        }
    } else if (isRefund) {
        if (!markAsFailed) {
            newTotalRefunded += amount;
            financialsEvent = FINANCIALS_EVENT.REFUND_SUCCESS;
        } else {
            financialsEvent = FINANCIALS_EVENT.REFUND_FAILED;
        }
    }

    const newNetPaid = newTotalPaid - newTotalRefunded;
    const isBankTransfer = [PAYMENT_METHOD.BANK_TRANSFER, REFUND_METHOD.BANK_TRANSFER].includes(method);
    const isCardOnline = [PAYMENT_METHOD.CARD_ONLINE, REFUND_METHOD.CARD_ONLINE].includes(method);
    const isCardOffline = [REFUND_METHOD.CARD_OFFLINE].includes(method);
    const now = new Date();

    dbOrder.lastActivityAt = now;
    dbOrder.financials.totalPaid = +(newTotalPaid.toFixed(2));
    dbOrder.financials.totalRefunded = +(newTotalRefunded.toFixed(2));
    dbOrder.financials.state = getFinancialsState(
        dbOrder.currentStatus,
        newNetPaid,
        dbOrder.totals.totalAmount,
        dbOrder.financials.eventHistory // Старая история, ДО добавления новой записи
    );
    dbOrder.financials.eventHistory.push({
        event: financialsEvent,
        action: {
            method,
            amount,
            ...((isBankTransfer || isCardOnline) && {
                provider,
                transactionId,
                ...(markAsFailed && { failureReason })
            }),
            ...(isCardOnline && isRefund && { originalPaymentId }),
            ...(isCardOffline && isRefund && { externalReference })
        },
        changedBy: { id: actor._id, name: actor.name, role: actor.role },
        changedAt: createdAt || now
    });

    return { newNetPaid };
};

export const updateCustomerTotalSpent = async (customerId, amountDelta, session = null, logContext = '') => {
    const amountDeltaSafe = +Number(amountDelta).toFixed(2);
    if (amountDeltaSafe === 0) return;

    // Атомарное обновление общей суммы оплат с округлением
    const updateResult = await User.updateOne(
        { _id: customerId },
        [{ $set: { totalSpent: { $round: [{ $add: ['$totalSpent', amountDeltaSafe] }, 2] } } }],
        { session }
    );

    // Логирование события, когда покупатель не найден в базе
    if (updateResult.matchedCount === 0) {
        logCriticalEvent({
            logContext,
            category: 'financials',
            reason: 'Целостность данных нарушена: пользователь не найден для обновления баланса',
            data: {
                customerId,
                amountDelta: amountDeltaSafe,
                action: 'updateCustomerTotalSpent'
            }
        });
    }
};

export const clearOrderOnlineTransaction = async (orderId, stuckStatus) => {
    const updateResult = await Order.updateOne(
        {
            _id: orderId,
            _modelType: ORDER_MODEL_TYPE.FINAL,
            'financials.currentOnlineTransaction.status': stuckStatus
        },
        { $unset: { 'financials.currentOnlineTransaction': '' } }
    );

    return updateResult.modifiedCount;
};
