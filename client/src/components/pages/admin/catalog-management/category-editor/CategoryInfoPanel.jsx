import React from 'react';
import { CLIENT_CONSTANTS } from '@shared/constants.js';

const { CATEGORY_ROOT_LABEL, NO_VALUE_LABEL } = CLIENT_CONSTANTS;
 
export default function CategoryInfoPanel({ categoryMap, selectedCategoryId }) {
    const selectedCategory = categoryMap[selectedCategoryId];

    return (
        <div className="category-info-panel">
            <div className="panel-row panel-title">
                <h4>Параметры выбранной категории</h4>
            </div>

            <div className="panel-row">
                <div className="panel-col panel-row-label">ID:</div>
                <div className="panel-col panel-row-value">
                    {selectedCategory?.id ?? NO_VALUE_LABEL}
                </div>
            </div>
            <div className="panel-row">
                <div className="panel-col panel-row-label">Название:</div>
                <div className="panel-col panel-row-value">
                    {selectedCategoryId
                        ? selectedCategory?.name ?? NO_VALUE_LABEL
                        : 'Все категории'}
                </div>
            </div>
            <div className="panel-row">
                <div className="panel-col panel-row-label">URL-адрес:</div>
                <div className="panel-col panel-row-value">
                    {selectedCategory?.slug ?? NO_VALUE_LABEL}
                </div>
            </div>
            <div className="panel-row">
                <div className="panel-col panel-row-label">Порядковый номер:</div>
                <div className="panel-col panel-row-value">
                    {selectedCategory ? selectedCategory.order + 1 : NO_VALUE_LABEL}
                </div>
            </div>
            <div className="panel-row">
                <div className="panel-col panel-row-label">Родительская категория:</div>
                <div className="panel-col panel-row-value">
                    {selectedCategory?.parent
                        ? categoryMap[selectedCategory.parent].name
                        : selectedCategoryId ? CATEGORY_ROOT_LABEL : NO_VALUE_LABEL}
                </div>
            </div>
        </div>
    );
};
