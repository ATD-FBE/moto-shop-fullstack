import React, { useState, useEffect }  from 'react';
import cn from 'classnames';
import { OrderLastFinancialsEvent } from '@/components/parts/OrderParts.jsx';
import PaymentForm from './financials-status-panel/PaymentForm.jsx';
import RefundForm from './financials-status-panel/RefundForm.jsx';
import VoidEventForm from './financials-status-panel/VoidEventForm.jsx';
import CheckboxCollapsible from '@/components/common/CheckboxCollapsible.jsx';
import { formatCurrency } from '@/helpers/textHelpers.js';
import { formatFinancialsEventHistoryLogs } from '@/services/orderService.js';
import { getLastFinancialsEventEntry } from '@shared/commonHelpers.js';
import { getOrderCardRefundStats } from '@shared/calculations.js';
import {
    ORDER_STATUS,
    FINANCIALS_STATE_CONFIG,
    FINANCIALS_PAID_FINAL_STATES,
    FINANCIALS_CANCEL_FINAL_STATES,
    CLIENT_CONSTANTS
} from '@shared/constants.js';

const { NO_VALUE_LABEL } = CLIENT_CONSTANTS;

export default function FinancialsStatusPanel({
    showExtras,
    orderId,
    orderStatus,
    defaultPaymentMethod,
    financialsState,
    financialsEventHistory,
    netPaid,
    totalAmount
}) {
    const [logs, setLogs] = useState('');

    const isCancelledOrder = orderStatus === ORDER_STATUS.CANCELLED;
    const hasPendingFinancials =
        (!isCancelledOrder && !FINANCIALS_PAID_FINAL_STATES.includes(financialsState)) ||
        (isCancelledOrder && !FINANCIALS_CANCEL_FINAL_STATES.includes(financialsState));

    const financialsStateConfig = FINANCIALS_STATE_CONFIG[financialsState];

    const formattedNetPaid = formatCurrency(netPaid);
    const formattedTotalAmount = formatCurrency(totalAmount);

    const { availableCardRefundAmount } = getOrderCardRefundStats(financialsEventHistory);

    useEffect(() => {
        if (!showExtras) return;
        setLogs(formatFinancialsEventHistoryLogs(financialsEventHistory));
    }, [financialsEventHistory]);

    return (
        <div className="financials-status-panel">
            <div className="financials-status-panel-title">
                <h4>Оплата</h4>

                {hasPendingFinancials && (
                    <div className="badge-box single-badge">
                        <span className="badge">❗</span>
                    </div>
                )}
            </div>

            <div className="financials-status-panel-container">
                <p className="financials-state">
                    <span className="label">{'Текущее состояние: '}</span>
                    <span className={cn('value', financialsStateConfig?.intent ?? '')}>
                        {financialsStateConfig?.label ?? NO_VALUE_LABEL}
                    </span>
                </p>

                {showExtras ? (
                    <p className="financials-summary">
                        {'Фактически оплачено'}
                        <span className="info" title="Сумма, оплаченная с учётом возвратов">ⓘ</span>
                        {'/Всего: '}
                        <span className={cn('net-paid', financialsStateConfig?.intent ?? '')}>
                            {formattedNetPaid}
                        </span>
                        {'/'}
                        <span className="total-amount">{formattedTotalAmount}</span>
                        {' руб.'}
                    </p>
                ) : (
                    <OrderLastFinancialsEvent
                        lastFinancialsEventEntry={getLastFinancialsEventEntry(financialsEventHistory)}
                        showDate={true}
                    />
                )}

                <CheckboxCollapsible
                    checkboxLabel="Добавление оплаты"
                    contentClass="payment-form"
                >
                    <PaymentForm
                        orderId={orderId}
                        orderStatus={orderStatus}
                        defaultMethod={defaultPaymentMethod}
                        netPaid={netPaid}
                        totalAmount={totalAmount}
                    />
                </CheckboxCollapsible>

                <CheckboxCollapsible
                    checkboxLabel="Возврат средств"
                    contentClass="refund-form"
                >
                    <RefundForm
                        orderId={orderId}
                        orderStatus={orderStatus}
                        netPaid={netPaid}
                        totalAmount={totalAmount}
                        availableCardRefundAmount={availableCardRefundAmount}
                    />
                </CheckboxCollapsible>

                {showExtras && (
                    <>
                        <CheckboxCollapsible
                            checkboxLabel="Аннулирование платежа"
                            contentClass="void-event-form"
                        >
                            <VoidEventForm
                                orderId={orderId}
                                hasFinancialsEvents={financialsEventHistory.length > 0}
                            />
                        </CheckboxCollapsible>

                        <CheckboxCollapsible
                            checkboxLabel="История платежей"
                            contentClass="logs"
                        >
                            <textarea
                                className="logs"
                                value={logs}
                                readOnly
                                spellCheck={false}
                            >
                            </textarea>
                        </CheckboxCollapsible>
                    </>
                )}
            </div>
        </div>
    );
};
