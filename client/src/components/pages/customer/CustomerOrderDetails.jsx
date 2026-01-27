import React from 'react';
import OrderDetailsBase from '@/components/pages/shared/OrderDetailsBase.jsx';
import CardOnlinePaymentLink from './customer-orders/CardOnlinePaymentLink.jsx';
import OrderRepeatButton from './customer-orders/OrderRepeatButton.jsx';
import { OrderRefreshButton } from '@/components/parts/OrderParts.jsx';
import { CLIENT_CONSTANTS } from '@shared/constants.js';

const { NO_VALUE_LABEL } = CLIENT_CONSTANTS;

export default function CustomerOrderDetails() {
    return (
        <OrderDetailsBase
            routeKey="customerOrderDetails"
            renderHeaderContent={(orderNumber) => (
                <>
                    <h2>{`Детали заказа №${orderNumber ?? NO_VALUE_LABEL}`}</h2>
                    <p>Подробная информация о заказе</p>
                </>
            )}
            renderCardOnlinePaymentLink={props => <CardOnlinePaymentLink {...props} />}
            renderOrderRefreshButton={props => <OrderRefreshButton {...props} />}
            renderOrderRepeatButton={props => <OrderRepeatButton {...props} />}
        />
    );
};
