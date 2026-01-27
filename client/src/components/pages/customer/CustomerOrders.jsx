import React from 'react';
import OrdersBase from '@/components/pages/shared/OrdersBase.jsx';
import { OrderCardStatusSummary, OrderRefreshButton } from '@/components/parts/OrderParts.jsx';
import CardOnlinePaymentLink from './customer-orders/CardOnlinePaymentLink.jsx';
import OrderRepeatButton from './customer-orders/OrderRepeatButton.jsx';

export default function CustomerOrders() {
    return (
        <OrdersBase
            headerContent={
                <>
                    <h2>Заказы</h2>
                    <p>Информация об активных и завершённых заказах</p>
                </>
            }
            showSort={true}
            isMetaMobileStacked={true}
            renderCardOnlinePaymentLink={props => <CardOnlinePaymentLink {...props} />}
            renderStatusSummary={props => <OrderCardStatusSummary {...props} />}
            renderOrderRefreshButton={props => <OrderRefreshButton {...props} />}
            renderOrderRepeatButton={props => <OrderRepeatButton {...props} />}
        />
    );
};
