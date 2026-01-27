import React from 'react';
import ProductTableHeader from './product-table/ProductTableHeader.jsx';
import ProductTableBody from './product-table/ProductTableBody.jsx';
import ProductTableFooter from './product-table/ProductTableFooter.jsx';

export default function ProductTable({
    loadStatus,
    uiBlocked,
    paginatedItems,
    filteredItems,
    selectedItems,
    expandedItems,
    toggleAllItemSelection,
    toggleItemSelection,
    toggleItemExpansion,
    confirmItemDeletion,
    confirmBulkItemDeletion,
    reloadItems,
    allowedCategories,
    processItemForm,
    processBulkItemForm
}) {
    return (
        <div role="table" className="entity-table product-table">
            <ProductTableHeader
                uiBlocked={uiBlocked}
                filteredItems={filteredItems}
                selectedItems={selectedItems}
                toggleAllItemSelection={toggleAllItemSelection}
            />

            <ProductTableBody
                loadStatus={loadStatus}
                uiBlocked={uiBlocked}
                paginatedItems={paginatedItems}
                selectedItems={selectedItems}
                expandedItems={expandedItems}
                toggleItemSelection={toggleItemSelection}
                toggleItemExpansion={toggleItemExpansion}
                confirmItemDeletion={confirmItemDeletion}
                reloadItems={reloadItems}
                allowedCategories={allowedCategories}
                processItemForm={processItemForm}
            />

            <ProductTableFooter
                uiBlocked={uiBlocked}
                selectedItems={selectedItems}
                allowedCategories={allowedCategories}
                processBulkItemForm={processBulkItemForm}
                confirmBulkItemDeletion={confirmBulkItemDeletion}
            />
        </div>
    );
};
