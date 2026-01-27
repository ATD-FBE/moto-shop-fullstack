import React from 'react';
import { formatCurrency } from '@/helpers/textHelpers.js';

export default function CheckoutSummary({ orderTotals }) {
    const { subtotalAmount = 0, totalSavings = 0, totalAmount = 0 } = orderTotals ?? {};

    return (
        <div className="checkout-summary">
            <div className="checkout-row">
                <p className="checkout-label">Сумма заказа:</p>
                <div className="checkout-values">
                    {totalSavings > 0 && (
                        <p className="checkout-value order-subtotal">
                            {formatCurrency(subtotalAmount)} руб.
                        </p>
                    )}
                    <p className="checkout-value order-total">
                        {formatCurrency(totalAmount)} руб.
                    </p>
                </div>
            </div>

            {totalSavings > 0 && (
                <div className="checkout-row">
                    <p className="checkout-label">Экономия:</p>
                    <p className="checkout-value order-total-savings">
                        {formatCurrency(totalSavings)} руб.
                    </p>
                </div>
            )}

            <div className="checkout-row final-row">
                <p className="checkout-label order-final-total-label">Итого:</p>
                <p className="checkout-value order-final-total">
                    {formatCurrency(totalAmount)} руб.
                </p>
            </div>
        </div>
    );
};
