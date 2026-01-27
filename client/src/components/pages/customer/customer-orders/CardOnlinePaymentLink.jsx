import React from 'react';
import BlockableLink from '@/components/common/BlockableLink.jsx';
import { routeConfig } from '@/config/appRouting.js';

export default function CardOnlinePaymentLink({ orderNumber, orderId }) {
    return (
        <BlockableLink
            className="card-online-payment-link"
            to={routeConfig.customerOrderCardOnlinePayment.generatePath({ orderNumber, orderId })}
        >
            <span className="icon">💳</span>
            {'  '}
            Оплатить
        </BlockableLink>
    );
};
