import React, { useState, useMemo } from 'react';
import cn from 'classnames';
import Collapsible from '@/components/common/Collapsible.jsx';
import CategoryForm from './category-control-panel/CategoryForm.jsx';
import { buildSafeParentCategoryMap } from '@/helpers/categoryHelpers.js';
import { CLIENT_CONSTANTS } from '@shared/constants.js';

const { CATEGORY_ROOT_LABEL } = CLIENT_CONSTANTS;
const FORM_CREATE = 'create';
const FORM_EDIT = 'edit';
 
export default function CategoryControlPanel({
    uiBlocked,
    categoryTree,
    categoryMap,
    selectedCategoryId,
    processCategoryForm,
    confirmCategoryDeletion
}) {
    const [activeForm, setActiveForm] = useState(null);

    const selectedCategory = categoryMap[selectedCategoryId];

    const parentCategoryMap = useMemo(
        () => buildSafeParentCategoryMap(categoryMap, categoryTree, CATEGORY_ROOT_LABEL),
        [categoryMap, categoryTree]
    );

    const toggleForm = (form) => setActiveForm(prev => prev === form ? null : form);
    const getSubcategories = (id) => id ? categoryMap[id]?.subcategories || [] : categoryTree;
      
    const createFormProps = useMemo(() => ({
        initValues: {
            name: '',
            slug: '',
            order: 0,
            parent: selectedCategoryId || null
        },
        defaultOrder: getSubcategories(selectedCategoryId).length,
        maxOrder: getSubcategories(selectedCategoryId).length,
        isRestricted: selectedCategory?.restricted,
        parentName: selectedCategory?.name ?? CATEGORY_ROOT_LABEL
    }), [selectedCategoryId, categoryMap]);

    const editFormProps = useMemo(() => ({
        categoryId: selectedCategoryId || '',
        initValues: {
            name: selectedCategory?.name ?? '',
            slug: selectedCategory?.slug ?? '',
            order: selectedCategory?.order ?? 0,
            parent: selectedCategory?.parent ?? null
        },
        maxOrder: getSubcategories(selectedCategory?.parent).length - 1,
        isRestricted: selectedCategory?.restricted,
        safeParentData: parentCategoryMap[selectedCategoryId] ?? {
            selectOptions: [],
            subcatCounts: {}
        }
    }), [selectedCategoryId, categoryMap]);

    return (
        <div className="category-control-panel">
            <div className="panel-row panel-title">
                <h4>Управление категорией</h4>
            </div>

            <div className="panel-row category-form-action">
                <button
                    className={cn(
                        'category-form-toggle-btn--create',
                        { 'enabled': activeForm === FORM_CREATE }
                    )}
                    onClick={() => toggleForm(FORM_CREATE)}
                    disabled={uiBlocked || selectedCategory?.restricted}
                >
                    <span className="icon">➕</span>
                    {selectedCategoryId ? 'Создать подкатегорию' : 'Создать категорию'}
                </button>

                <Collapsible
                    isExpanded={activeForm === FORM_CREATE && !selectedCategory?.restricted}
                    className="category-form-collapsible"
                    showContextIndicator={false}
                >
                    {/* Форма для создания новой категории внутри выбранной */}
                    <CategoryForm
                        { ...createFormProps }
                        onSubmit={processCategoryForm}
                        uiBlocked={uiBlocked}
                    />
                </Collapsible>
            </div>

            <div className="panel-row category-form-action">
                <button
                    className={cn(
                        'category-form-toggle-btn--edit',
                        { 'enabled': activeForm === FORM_EDIT }
                    )}
                    onClick={() => toggleForm(FORM_EDIT)}
                    disabled={uiBlocked || !selectedCategoryId}
                >
                    <span className="icon">🖊</span>
                    Изменить выбранную категорию
                </button>

                <Collapsible
                    isExpanded={activeForm === FORM_EDIT && selectedCategoryId}
                    className="category-form-collapsible"
                    showContextIndicator={false}
                >
                    {/* Форма для редактирования выбранной категории */}
                    <CategoryForm
                        {...editFormProps}
                        onSubmit={processCategoryForm}
                        uiBlocked={uiBlocked}
                    />
                </Collapsible>
            </div>

            <div className="panel-row">
                <button
                    className="delete-category-btn"
                    onClick={confirmCategoryDeletion}
                    disabled={uiBlocked || !selectedCategoryId || selectedCategory?.restricted}
                >
                    <span className="icon">❌</span>
                    Удалить выбранную категорию
                </button>
            </div>
        </div>
    );
};
