import React, { useState } from 'react';
import cn from 'classnames';
import Collapsible from '@/components/common/Collapsible.jsx';
import BulkProductForm from './product-table-footer/BulkProductForm.jsx';

export default function ProductTableFooter({
    uiBlocked,
    selectedItems,
    allowedCategories,
    processBulkItemForm,
    confirmBulkItemDeletion,
}) {
    const [isExpanded, setIsExpanded] = useState(false);

    return (
        <div className="table-footer-wrapper">
            <div role="rowgroup" className="table-footer">
                <div role="row">
                    <div role="columnfooter" className="row-cell select-label">
                        <div className="cell-label visible">Выбранные товары:</div>
                        <div className="cell-content">{selectedItems.size}</div>
                    </div>
                    <div role="columnfooter" className="row-cell bulk-edit">
                        <div className="cell-label">Редактирование группы:</div>
                        <div className="cell-content">
                            <button
                                className={cn('bulk-edit-products-btn', { 'enabled': isExpanded })}
                                onClick={() => setIsExpanded(prev => !prev)}
                            >
                                <span className="icon">{isExpanded ? '🔼' : '🖊'}</span>
                                {isExpanded ? 'Скрыть форму' : 'Править группу'}
                            </button>
                        </div>
                    </div>
                    <div role="columnfooter" className="row-cell bulk-delete">
                        <div className="cell-label">Удаление группы:</div>
                        <div className="cell-content">
                            <button
                                className="bulk-delete-products-btn"
                                onClick={() => confirmBulkItemDeletion([...selectedItems])}
                                disabled={uiBlocked || !selectedItems.size}
                            >
                                <span className="icon">❌</span>
                                Удалить группу
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <Collapsible isExpanded={isExpanded} className="bulk-product-form-collapsible">
                <BulkProductForm
                    uiBlocked={uiBlocked}
                    productIds={[...selectedItems]}
                    allowedCategories={allowedCategories}
                    onSubmit={processBulkItemForm}
                />
            </Collapsible>
        </div>
    );
};
