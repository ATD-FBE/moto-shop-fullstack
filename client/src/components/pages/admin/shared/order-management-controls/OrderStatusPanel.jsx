import React, { useState, useEffect }  from 'react';
import cn from 'classnames';
import OrderStatusSteps from './order-status-panel/OrderStatusSteps.jsx';
import CheckboxCollapsible from '@/components/common/CheckboxCollapsible.jsx';
import { formatOrderStatusHistoryLogs } from '@/services/orderService.js';
import { ORDER_STATUS_CONFIG, CLIENT_CONSTANTS } from '@shared/constants.js';

const { NO_VALUE_LABEL } = CLIENT_CONSTANTS;

export default function OrderStatusPanel({
    showExtras,
    isActiveOrder,
    orderId,
    currentOrderStatusEntry,
    orderStatusHistory,
    deliveryMethod,
    allowCourierExtra,
    shippingCost,
    netPaid,
    totalAmount
}) {
    const [logs, setLogs] = useState('');

    const currentOrderStatusConfig = ORDER_STATUS_CONFIG[currentOrderStatusEntry.status];
    const currentOrderStatusDate = new Date(currentOrderStatusEntry.changedAt)?.toLocaleString();

    useEffect(() => {
        if (!showExtras) return;
        setLogs(formatOrderStatusHistoryLogs(orderStatusHistory));
    }, [orderStatusHistory]);

    return (
        <div className="order-status-panel">
            <div className="order-status-panel-title">
                <h4>Обработка заказа</h4>
                
                {isActiveOrder && (
                    <div className="badge-box single-badge">
                        <span className="badge">❗</span>
                    </div>
                )}
            </div>

            <div className="order-status-panel-container">
                <p className="current-order-status">
                    <span className="label">{`Текущий статус (от ${currentOrderStatusDate}): `}</span>
                    <span className={cn('value', currentOrderStatusConfig?.intent ?? '')}>
                        {currentOrderStatusConfig?.label ?? NO_VALUE_LABEL}
                    </span>
                </p>

                <CheckboxCollapsible
                    checkboxLabel="Управление заказом"
                    contentClass="order-status-steps"
                >
                    <OrderStatusSteps
                        orderId={orderId}
                        currentOrderStatus={currentOrderStatusEntry.status}
                        lastActiveOrderStatus={currentOrderStatusEntry.lastActiveStatus}
                        deliveryMethod={deliveryMethod}
                        allowCourierExtra={allowCourierExtra}
                        shippingCost={shippingCost}
                        netPaid={netPaid}
                        totalAmount={totalAmount}
                    />
                </CheckboxCollapsible>

                {showExtras && (
                    <CheckboxCollapsible
                        checkboxLabel="История изменений статуса"
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
                )}
            </div>
        </div>
    );
};
