import React from 'react';
import cn from 'classnames';

export default function SectionEditButton({ section, isFormExpanded, toggleSectionFormExpansion }) {
    return (
        <button
            className={cn('edit-order-details-section-btn', { 'enabled': isFormExpanded })}
            onClick={() => toggleSectionFormExpansion(section)}
        >
            <span className="icon">🖊</span>
            Редактировать
        </button>
    );
};
