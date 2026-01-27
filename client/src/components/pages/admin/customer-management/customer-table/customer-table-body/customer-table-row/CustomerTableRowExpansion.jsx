import React from 'react';
import CustomerTableOrders from './customer-table-row-expansion/CustomerTableOrders.jsx';

export default function CustomerTableRowExpansion({ ...props }) {
    return (
        <div className="table-row-expansion">
            <CustomerTableOrders {...props} />
        </div>
    );
};
