import React, { useMemo } from 'react';
import DesignedCheckbox from '@/components/common/DesignedCheckbox.jsx';

export default function CustomerTableHeader({
    uiBlocked,
    filteredItems,
    selectedItems,
    toggleAllItemSelection
}) {
    const areAllItemsSelected = useMemo(
        () => filteredItems.size > 0 && selectedItems.size === filteredItems.size,
        [selectedItems, filteredItems]
    );
    const areSomeItemsSelected = useMemo(
        () => selectedItems.size > 0 && !areAllItemsSelected,
        [selectedItems, areAllItemsSelected]
    );

    return (
        <div role="rowgroup" className="table-header">
            <div role="row">
                <div role="columnheader" className="row-cell visible select">
                    <div className="cell-label">Выбрать всех:</div>
                    <div className="cell-content">
                        <DesignedCheckbox
                            checkIcon={areAllItemsSelected ? '✅' : areSomeItemsSelected ? '⬛' : '⬜'}
                            checked={areAllItemsSelected || areSomeItemsSelected}
                            onChange={() => toggleAllItemSelection(areAllItemsSelected)}
                            disabled={uiBlocked}
                        />
                    </div>
                </div>
                <div role="columnheader" className="row-cell id">ID</div>
                <div role="columnheader" className="row-cell name">Имя</div>
                <div role="columnheader" className="row-cell email">Email</div>
                <div role="columnheader" className="row-cell reg-date">Дата регистрации</div>
                <div role="columnheader" className="row-cell discount">Скидка</div>
                <div role="columnheader" className="row-cell total-spent">Сумма покупок</div>
                <div role="columnheader" className="row-cell orders">Заказы</div>
                <div role="columnheader" className="row-cell ban">Блокировка</div>
            </div>
        </div>
    );
};
