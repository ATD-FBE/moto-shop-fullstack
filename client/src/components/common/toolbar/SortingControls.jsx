import React, { useState, useEffect } from 'react';
import DesignedCheckbox from '@/components/common/DesignedCheckbox.jsx';

export default function SortingControls({ uiBlocked, options, sort, setSort }) {
    const [sortField, setSortField] = useState(sort.startsWith('-') ? sort.slice(1) : sort);
    const [isDescending, setIsDescending] = useState(sort.startsWith('-'));

    const handleSortFieldChange = (field) => {
        const option = options.find(opt => opt.dbField === field);
        const isDesc = option ? option.defaultOrder === 'desc' : isDescending;
    
        setSortField(field);
        setIsDescending(isDesc);
    };

    // Установка полной строки сортировки через внешний сеттер
    useEffect(() => {
        const newSort = (isDescending ? '-' : '') + sortField;
        if (newSort !== sort) setSort(newSort);
    }, [sortField, isDescending]);

    return (
        <div className="sorting-controls">
            <div className="sort-options">
                <label htmlFor="sort" className="sort-label">Сортировка: </label>
                
                <select
                    id="sort"
                    value={sortField}
                    onChange={(e) => handleSortFieldChange(e.target.value)}
                    disabled={uiBlocked}
                >
                    {options.map(({ dbField, label }, idx) => (
                        <option key={idx} value={dbField}>
                            {label}
                        </option>
                    ))}
                </select>
            </div>

            <div className="sort-descending">
                <DesignedCheckbox
                    label="По убыванию"
                    checked={isDescending}
                    onChange={(e) => setIsDescending(e.target.checked)}
                    disabled={uiBlocked}
                />
            </div>
        </div>
    );
};
