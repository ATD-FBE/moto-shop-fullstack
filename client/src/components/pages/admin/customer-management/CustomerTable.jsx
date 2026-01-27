import React from 'react';
import CustomerTableHeader from './customer-table/CustomerTableHeader.jsx';
import CustomerTableBody from './customer-table/CustomerTableBody.jsx';

export default function CustomerTable({
    loadStatus,
    uiBlocked,
    paginatedItems,
    filteredItems,
    selectedItems,
    expandedItems,
    toggleAllItemSelection,
    toggleItemSelection,
    toggleItemExpansion,
    updateItemDiscount,
    toggleItemBanStatus,
    reloadItems
}) {
    return (
        <div role="table" className="entity-table customer-table">
            <CustomerTableHeader
                uiBlocked={uiBlocked}
                filteredItems={filteredItems}
                selectedItems={selectedItems}
                toggleAllItemSelection={toggleAllItemSelection}
            />

            <CustomerTableBody
                loadStatus={loadStatus}
                uiBlocked={uiBlocked}
                paginatedItems={paginatedItems}
                selectedItems={selectedItems}
                expandedItems={expandedItems}
                toggleItemSelection={toggleItemSelection}
                toggleItemExpansion={toggleItemExpansion}
                updateItemDiscount={updateItemDiscount}
                toggleItemBanStatus={toggleItemBanStatus}
                reloadItems={reloadItems}
            />
        </div>
    );
};
