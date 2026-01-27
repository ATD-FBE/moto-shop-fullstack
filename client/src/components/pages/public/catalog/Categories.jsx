import React, { useState, useMemo } from 'react';
import { useSelector } from 'react-redux';
import cn from 'classnames';
import Collapsible from '@/components/common/Collapsible.jsx';
import { findCategoryPath, getAllExpandableCategoryIds } from '@/helpers/categoryHelpers.js';
import { DATA_LOAD_STATUS } from '@shared/constants.js';

export default function Categories({
    loadStatus,
    reloadCategories,
    categoryTree,
    selectedCategoryId,
    setSelectedCategoryId
}) {
    const isDashboardActive = useSelector(state => state.ui.dashboardPanelActive);
    const [expandedCategoryIds, setExpandedCategoryIds] = useState([]);

    const selectedCategoryPath = useMemo(
        () => findCategoryPath(categoryTree, selectedCategoryId),
        [categoryTree, selectedCategoryId]
    );
    const allExpandableCategoryIds = useMemo(
        () => getAllExpandableCategoryIds(categoryTree),
        [categoryTree]
    );

    const isReady = loadStatus === DATA_LOAD_STATUS.READY;
    const isAllExpanded = expandedCategoryIds.length === allExpandableCategoryIds.length;

    const toggleAllCategoriesExpansion = () => {
        if (isAllExpanded) {
            setExpandedCategoryIds([]);
        } else {
            setExpandedCategoryIds(allExpandableCategoryIds);
        }
    };

    return (
        <div className={cn('categories', {
            'ready': isReady,
            'dashboard-panel-active': isDashboardActive
        })}>
            <header className="categories-header">
                <h3>Категории товаров</h3>
            </header>

            <div className="categories-controls">
                <button
                    className="select-all-categories-btn enabled"
                    onClick={() => setSelectedCategoryId('')}
                    disabled={selectedCategoryId === ''}
                >
                    Все категории
                </button>

                <button
                    className="toggle-all-categories-expansion-btn enabled"
                    onClick={toggleAllCategoriesExpansion}
                    disabled={!isReady}
                >
                    {isAllExpanded ? 'Свернуть все' : 'Развернуть все'}
                </button>
            </div>

            <CategoryList
                loadStatus={loadStatus}
                reloadCategories={reloadCategories}
                categoryTree={categoryTree}
                expandedCategoryIds={expandedCategoryIds}
                setExpandedCategoryIds={setExpandedCategoryIds}
                selectedCategoryId={selectedCategoryId}
                setSelectedCategoryId={setSelectedCategoryId}
                selectedCategoryPath={selectedCategoryPath}
            />
        </div>
    );
};

function CategoryList({
    loadStatus,
    reloadCategories,
    categoryTree,
    expandedCategoryIds,
    setExpandedCategoryIds,
    selectedCategoryId,
    setSelectedCategoryId,
    selectedCategoryPath
}) {
    if (loadStatus === DATA_LOAD_STATUS.LOADING) {
        return (
            <div className="categories-load-status">
                <p>
                    <span className="icon load">⏳</span>
                    Загрузка категорий товаров...
                </p>
            </div>
        );
    }

    if (loadStatus === DATA_LOAD_STATUS.ERROR) {
        return (
            <div className="categories-load-status">
                <p>
                    <span className="icon error">❌</span>
                    Ошибка сервера. Категории товаров не доступны.
                </p>
                <button className="reload-btn" onClick={reloadCategories}>Повторить</button>
            </div>
        );
    }

    if (loadStatus === DATA_LOAD_STATUS.NOT_FOUND) {
        return (
            <div className="categories-load-status">
                <p>
                    <span className="icon not-found">🔎</span>
                    На данный момент категорий товаров нет.
                </p>
            </div>
        );
    }

    return (
        <ul className="category-list">
            {categoryTree.map(cat => (
                <CategoryItem
                    key={cat.id}
                    category={cat}
                    expandedCategoryIds={expandedCategoryIds}
                    setExpandedCategoryIds={setExpandedCategoryIds}
                    selectedCategoryId={selectedCategoryId}
                    setSelectedCategoryId={setSelectedCategoryId}
                    selectedCategoryPath={selectedCategoryPath}
                />
            ))}
        </ul>
    );
}

function CategoryItem({
    category,
    expandedCategoryIds,
    setExpandedCategoryIds,
    selectedCategoryId,
    setSelectedCategoryId,
    selectedCategoryPath
}) {
    const isExpanded = expandedCategoryIds.includes(category.id);
    const hasSubcategories = category.subcategories?.length > 0;
    const isInSelectedPath = selectedCategoryPath.includes(category.id);
    const isSelected = selectedCategoryId === category.id;

    const selectCategory = () => setSelectedCategoryId(category.id);
    
    const toggleSubcategories = (e) => {
        e.stopPropagation();

        setExpandedCategoryIds(prev =>
            prev.includes(category.id)
                ? prev.filter(id => id !== category.id)
                : [...prev, category.id]
        );
    };

    return (
        <li>
            <div
                className={cn(
                    'category-item',
                    { 'expanded': isExpanded },
                    { 'in-selected-path': isInSelectedPath },
                    { 'selected': isSelected }
                )}
                onClick={selectCategory}
            >
                <span className="category-name">{category.name}</span>

                {hasSubcategories && (
                    <div className="subcategories-toggle" onClick={toggleSubcategories}>
                        <span className="icon">▼</span>
                    </div>
                )}
            </div>

            {hasSubcategories && (
                <Collapsible
                    isExpanded={isExpanded}
                    className="subcategory-list-collapsible"
                    showContextIndicator={false}
                >
                    <ul className="subcategory-list">
                        {category.subcategories.map(sub => (
                            <CategoryItem
                                key={sub.id}
                                category={sub}
                                expandedCategoryIds={expandedCategoryIds}
                                setExpandedCategoryIds={setExpandedCategoryIds}
                                selectedCategoryId={selectedCategoryId}
                                setSelectedCategoryId={setSelectedCategoryId}
                                selectedCategoryPath={selectedCategoryPath}
                            />
                        ))}
                    </ul>
                </Collapsible>
            )}
        </li>
    );
}
