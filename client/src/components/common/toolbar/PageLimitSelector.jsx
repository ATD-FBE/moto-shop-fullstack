import React from 'react';

export default function PageLimitSelector({
    uiBlocked,
    options,
    limit,
    setLimit,
    page,
    setPage,
    totalItems
}) {
    function handleLimitChange(newLimit) {
        // Корректировка страницы при выходе за новые пределы
        const newTotalPages = Math.ceil(totalItems / newLimit) || 1;
        const newPage = page > newTotalPages ? newTotalPages : page;
    
        setLimit(newLimit);
        if (newPage !== page) setPage(newPage);
    }

    return (
        <div className="page-limit-selector">
            <label htmlFor="limit">Показывать по: </label>
            
            <select
                id="limit"
                value={limit}
                onChange={(e) => handleLimitChange(Number(e.target.value))}
                disabled={uiBlocked}
            >
                {options.map(num => (
                    <option key={num} value={num}>
                        {num}
                    </option>
                ))}
            </select>
        </div>
    );
};
