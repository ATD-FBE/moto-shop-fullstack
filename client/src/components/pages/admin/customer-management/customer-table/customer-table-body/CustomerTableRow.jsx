import React, { useState } from 'react';
import Collapsible from '@/components/common/Collapsible.jsx';
import CustomerTableRowMain from './customer-table-row/CustomerTableRowMain.jsx';
import CustomerTableRowExpansion from './customer-table-row/CustomerTableRowExpansion.jsx';

export default function CustomerTableRow({
    customer,
    uiBlocked,
    selectedItems,
    expandedItems,
    toggleItemSelection,
    toggleItemExpansion,
    updateItemDiscount,
    toggleItemBanStatus
}) {
    const [hoveredItem, setHoveredItem] = useState(null);

    const isHovered = hoveredItem === customer.id;
    const isSelected = selectedItems.has(customer.id);
    const isExpanded = expandedItems.has(customer.id);

    return (
        <div
            className="table-row"
            onMouseEnter={() => setHoveredItem(customer.id)}
            onMouseLeave={() => setHoveredItem(null)}
        >
            <CustomerTableRowMain
                customer={customer}
                uiBlocked={uiBlocked}
                isHovered={isHovered}
                isSelected={isSelected}
                isExpanded={isExpanded}
                toggleItemSelection={toggleItemSelection}
                toggleItemExpansion={toggleItemExpansion}
                updateItemDiscount={updateItemDiscount}
                toggleItemBanStatus={toggleItemBanStatus}
            />

            <Collapsible isExpanded={isExpanded} className="table-row-expansion-collapsible">
                <CustomerTableRowExpansion
                    customerId={customer.id}
                    customerName={customer.name}
                    isExpanded={isExpanded}
                />
            </Collapsible>
        </div>
    );
};
