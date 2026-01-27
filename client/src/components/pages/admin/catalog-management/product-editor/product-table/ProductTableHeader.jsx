import React, { useMemo } from 'react';
import DesignedCheckbox from '@/components/common/DesignedCheckbox.jsx';

export default function ProductTableHeader({
    uiBlocked,
    filteredItems,
    selectedItems,
    toggleAllItemSelection
}) {
    const areAllItemsSelected = useMemo(
        () => filteredItems.size > 0 && selectedItems.size === filteredItems.size,
        [filteredItems, selectedItems]
    );
    const areSomeItemsSelected = useMemo(
        () => selectedItems.size > 0 && !areAllItemsSelected,
        [selectedItems, areAllItemsSelected]
    );

    return (
        <div role="rowgroup" className="table-header">
            <div role="row">
                <div role="columnheader" className="row-cell visible select">
                    <div className="cell-label">Выбрать все:</div>
                    <div className="cell-content">
                        <DesignedCheckbox
                            checkIcon={areAllItemsSelected ? '✅' : areSomeItemsSelected ? '⬛' : '⬜'}
                            checked={areAllItemsSelected || areSomeItemsSelected}
                            onChange={() => toggleAllItemSelection(areAllItemsSelected)}
                            disabled={uiBlocked}
                        />
                    </div>
                </div>
                <div role="columnheader" className="row-cell thumb-link">Фото / Ссылка</div>
                <div role="columnheader" className="row-cell id-sku">ID / Артикул</div>
                <div role="columnheader" className="row-cell name-brand">Наименование / Бренд</div>
                <div role="columnheader" className="row-cell description">Описание</div>
                <div role="columnheader" className="row-cell stock-unit">Количество</div>
                <div role="columnheader" className="row-cell price-discount">Цена / Уценка</div>
                <div role="columnheader" className="row-cell category">Категория</div>
                <div role="columnheader" className="row-cell tags">Теги</div>
                <div role="columnheader" className="row-cell edit">Редактирование</div>
                <div role="columnheader" className="row-cell delete">Удаление</div>
            </div>
        </div>
    );
};
