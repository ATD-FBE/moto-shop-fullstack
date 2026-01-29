import { FINANCIALS_EVENT, PAYMENT_METHOD } from './constants.js';

// Клиентский рассчёт сумм товаров в корзине
export const calculateCartTotals = (cartProductData, customerDiscount) => {
    const { rawTotal, discountedTotal } =  cartProductData.reduce((acc, cartItem) => {
        const { price, quantity, discount: productDiscount } = cartItem;
        acc.rawTotal += price * quantity;

        const effectiveDiscount = Math.max(productDiscount, customerDiscount);
        const discountFactor = 1 - effectiveDiscount / 100;
        acc.discountedTotal += price * quantity * discountFactor;

        return acc;
    }, { rawTotal: 0, discountedTotal: 0 });

    return {
        rawTotal: Number(rawTotal.toFixed(2)),
        discountedTotal: Number(discountedTotal.toFixed(2))
    };
};

// Серверный рассчёт сумм заказа
export const calculateOrderTotals = (orderItemList, { confirmed = false } = {}) => {
    let subtotalAmount = 0;
    let totalAmount = 0;

    orderItemList.forEach(item => {
        const {
            quantity, priceSnapshot, originalUnitPrice, appliedDiscountSnapshot, appliedDiscount
        } = item;
        const price = confirmed ? originalUnitPrice : priceSnapshot;
        const discount = confirmed ? appliedDiscount : appliedDiscountSnapshot;

        const itemSubtotal = price * quantity;
        const discountFactor = 1 - discount / 100;
        const itemTotal = itemSubtotal * discountFactor;

        subtotalAmount += itemSubtotal;
        totalAmount += itemTotal;
    });

    const totalSavings = subtotalAmount - totalAmount;

    return {
        subtotalAmount: Number(subtotalAmount.toFixed(2)),
        totalSavings: Number(totalSavings.toFixed(2)),
        totalAmount: Number(totalAmount.toFixed(2))
    };
};

// Вычисление оплаченной и возвращённой сумм из истории финансовых событий заказа
export const calculateOrderFinancials = (history) => {
    return history.reduce(
        (acc, entry) => {
            if (entry.voided?.flag) return acc;

            if (entry.event === FINANCIALS_EVENT.PAYMENT_SUCCESS) {
                acc.totalPaid += entry.action.amount;
            } else if (entry.event === FINANCIALS_EVENT.REFUND_SUCCESS) {
                acc.totalRefunded += entry.action.amount;
            }
            return acc;
        },
        { totalPaid: 0, totalRefunded: 0 }
    );
};

export const getOrderCardRefundStats = (history) => {
    const alreadyRefundedTransactionIdSet = new Set(
        history
            .map(e => e.event === FINANCIALS_EVENT.REFUND_SUCCESS && e.action.originalPaymentId)
            .filter(Boolean)
    );

    const refundablePayments = [];
    const refundableProvidersSet = new Set();
    let availableCardRefundAmount = 0;

    for (const entry of history) {
        if (entry.voided?.flag) continue;
        if (entry.event !== FINANCIALS_EVENT.PAYMENT_SUCCESS) continue;
        if (entry.action.method !== PAYMENT_METHOD.CARD_ONLINE) continue;
        if (alreadyRefundedTransactionIdSet.has(entry.action.transactionId)) continue;

        refundablePayments.push(entry);
        refundableProvidersSet.add(entry.action.provider);
        availableCardRefundAmount += entry.action.amount;
    }

    return {
        refundablePayments,
        refundableProviders: [...refundableProvidersSet],
        availableCardRefundAmount
    };
};
