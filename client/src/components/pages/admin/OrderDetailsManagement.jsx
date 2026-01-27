import React from 'react';
import OrderDetailsBase from '@/components/pages/shared/OrderDetailsBase.jsx';
import OrderManagementControls from '@/components/pages/admin/shared/OrderManagementControls.jsx';
import OrderManagementNotes from '@/components/pages/admin/shared/OrderManagementNotes.jsx';
import SectionEditButton from './order-details-management/SectionEditButton.jsx';
import SectionFormCollapsible from './order-details-management/SectionFormCollapsible.jsx';
import { CLIENT_CONSTANTS } from '@shared/constants.js';

const { NO_VALUE_LABEL } = CLIENT_CONSTANTS;

export default function OrderDetailsManagement() {
    return (
        <OrderDetailsBase
            routeKey="adminOrderDetails"
            subscribeToUpdates={true}
            renderHeaderContent={(orderNumber) => (
                <>
                    <h2>{`Детали заказа №${orderNumber ?? NO_VALUE_LABEL}`}</h2>
                    <p>
                        Просмотр и управление заказом онлайн.
                        Редактирование данных доступно до принятия заказа в обработку.
                    </p>
                </>
            )}
            renderManagementControls={props => <OrderManagementControls showExtras={true} {...props} />}
            renderSectionEditButton={props => <SectionEditButton {...props} />}
            renderSectionFormCollapsible={props => <SectionFormCollapsible {...props} />}
            renderManagementNotes={props => <OrderManagementNotes {...props} />}
        />
    );
};
