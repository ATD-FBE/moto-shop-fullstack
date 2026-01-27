import React from 'react';
import OrderStatusPanel from './order-management-controls/OrderStatusPanel.jsx';
import FinancialsStatusPanel from './order-management-controls/FinancialsStatusPanel.jsx';
import InternalNotePanel from './order-management-controls/InternalNotePanel.jsx';
import AuditLogPanel from './order-management-controls/AuditLogPanel.jsx';

export default function OrderManagementControls({
    showExtras = false,
    isActiveOrder,
    orderId,
    currentOrderStatusEntry,
    orderStatusHistory,
    deliveryMethod,
    allowCourierExtra,
    shippingCost,
    defaultPaymentMethod,
    financialsState,
    financialsEventHistory,
    netPaid,
    totalAmount,
    internalNote,
    auditLog
}) {
    return (
        <div className="order-management-controls">
            <OrderStatusPanel
                showExtras={showExtras}
                isActiveOrder={isActiveOrder}
                orderId={orderId}
                currentOrderStatusEntry={currentOrderStatusEntry}
                orderStatusHistory={orderStatusHistory}
                deliveryMethod={deliveryMethod}
                allowCourierExtra={allowCourierExtra}
                shippingCost={shippingCost}
                netPaid={netPaid}
                totalAmount={totalAmount}
            />

            <FinancialsStatusPanel
                showExtras={showExtras}
                orderId={orderId}
                orderStatus={currentOrderStatusEntry.status}
                defaultPaymentMethod={defaultPaymentMethod}
                financialsState={financialsState}
                financialsEventHistory={financialsEventHistory}
                netPaid={netPaid}
                totalAmount={totalAmount}
            />

            {showExtras && (
                <>
                    <InternalNotePanel
                        orderId={orderId}
                        internalNote={internalNote}
                    />

                    <AuditLogPanel
                        auditLog={auditLog}
                    />
                </>
            )}
        </div>
    );
};