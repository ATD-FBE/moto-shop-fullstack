import React, { useState } from 'react';
import cn from 'classnames';
import Collapsible from '@/components/common/Collapsible.jsx';
import ProductTableRowMain from './product-table-row/ProductTableRowMain.jsx';
import ProductTableRowExpansion from './product-table-row/ProductTableRowExpansion.jsx';

export default function ProductTableRow({
    product,
    uiBlocked,
    selectedItems,
    expandedItems,
    toggleItemSelection,
    toggleItemExpansion,
    confirmItemDeletion,
    allowedCategories,
    processItemForm
}) {
    const [hoveredItem, setHoveredItem] = useState(null);

    const isHovered = hoveredItem === product.id;
    const isSelected = selectedItems.has(product.id);
    const isExpanded = expandedItems.has(product.id);

    return (
        <div
            className={cn('table-row', { 'hovered': isHovered })}
            onMouseEnter={() => setHoveredItem(product.id)}
            onMouseLeave={() => setHoveredItem(null)}
        >
            <ProductTableRowMain
                uiBlocked={uiBlocked}
                product={product}
                allowedCategories={allowedCategories}
                isHovered={isHovered}
                isSelected={isSelected}
                isExpanded={isExpanded}
                toggleItemSelection={toggleItemSelection}
                toggleItemExpansion={toggleItemExpansion}
                confirmItemDeletion={confirmItemDeletion}
            />

            <Collapsible isExpanded={isExpanded} className="table-row-expansion-collapsible">
                <ProductTableRowExpansion
                    uiBlocked={uiBlocked}
                    product={product}
                    allowedCategories={allowedCategories}
                    processItemForm={processItemForm}
                />
            </Collapsible>
        </div>
    );
};
