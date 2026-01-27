import React from 'react';
import OrdersBase from '@/components/pages/shared/OrdersBase.jsx';
import OrderManagementControls from '@/components/pages/admin/shared/OrderManagementControls.jsx';
import OrderManagementNotes from '@/components/pages/admin/shared/OrderManagementNotes.jsx';
import NewActiveOrdersAlert from './order-management/NewActiveOrdersAlert.jsx';

export default function OrderManagement() {
    return (
        <OrdersBase
            headerContent={
                <>
                    <h2>Управление заказами</h2>
                    <p>Данные обновляются в онлайн-режиме</p>
                </>
            }
            showSort={false}
            subscribeToUpdates={true}
            renderManagementControls={props => <OrderManagementControls {...props} />}
            renderManagementNotes={props => <OrderManagementNotes {...props} />}
            renderNewManagedActiveOrdersAlert={props => <NewActiveOrdersAlert {...props} />}
        />
    );
};
