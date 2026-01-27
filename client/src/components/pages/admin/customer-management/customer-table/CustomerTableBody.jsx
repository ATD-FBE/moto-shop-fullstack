import React, { useState, useRef, useEffect } from 'react';
import CustomerTableRow from './customer-table-body/CustomerTableRow.jsx';
import { CLIENT_CONSTANTS } from '@shared/constants.js';

const { LOAD_STATUS_MIN_HEIGHT, DATA_LOAD_STATUS } = CLIENT_CONSTANTS;

export default function CustomerTableBody({
    loadStatus,
    uiBlocked,
    paginatedItems,
    selectedItems,
    expandedItems,
    toggleItemSelection,
    toggleItemExpansion,
    updateItemDiscount,
    toggleItemBanStatus,
    reloadItems
}) {
    const [tableBodyHeight, setTableBodyHeight] = useState(LOAD_STATUS_MIN_HEIGHT);
    const tableBodyRef = useRef(null);

    useEffect(() => {
        if (!tableBodyRef.current) return;

        const newHeight = tableBodyRef.current.offsetHeight;
        if (newHeight !== tableBodyHeight) setTableBodyHeight(newHeight);
    }, [loadStatus]);

    if (loadStatus === DATA_LOAD_STATUS.LOADING) {
        return (
            <div
                className="table-body"
                style={{ height: Math.max(LOAD_STATUS_MIN_HEIGHT, tableBodyHeight) }}
            >
                <div className="table-load-status">
                    <p>
                        <span className="icon load">⏳</span>
                        Загрузка клиентов...
                    </p>
                </div>
            </div>
        );
    }

    if (loadStatus === DATA_LOAD_STATUS.ERROR) {
        return (
            <div ref={tableBodyRef} className="table-body" style={{ height: LOAD_STATUS_MIN_HEIGHT }}>
                <div className="table-load-status">
                    <p>
                        <span className="icon error">❌</span>
                        Ошибка сервера. Данные клиентов не доступны.
                    </p>
                    <button className="reload-btn" onClick={reloadItems}>Повторить</button>
                </div>
            </div>
        );
    }

    if (loadStatus === DATA_LOAD_STATUS.NOT_FOUND) {
        return (
            <div ref={tableBodyRef} className="table-body" style={{ height: LOAD_STATUS_MIN_HEIGHT }}>
                <div className="table-load-status">
                    <p>
                        <span className="icon not-found">🔎</span>
                        Клиенты не найдены.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div ref={tableBodyRef} role="rowgroup" className="table-body">
            {paginatedItems.map(customer => (
                <CustomerTableRow
                    key={customer.id}
                    customer={customer}
                    uiBlocked={uiBlocked}
                    selectedItems={selectedItems}
                    expandedItems={expandedItems}
                    toggleItemSelection={toggleItemSelection}
                    toggleItemExpansion={toggleItemExpansion}
                    updateItemDiscount={updateItemDiscount}
                    toggleItemBanStatus={toggleItemBanStatus}
                />
            ))}
        </div>
    );
};
