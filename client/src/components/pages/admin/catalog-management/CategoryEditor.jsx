import React, { useRef, useMemo, useEffect } from 'react';
import { useDispatch } from 'react-redux';
import CategorySelection from './category-editor/CategorySelectionPanel.jsx';
import CategoryInfoPanel from './category-editor/CategoryInfoPanel.jsx';
import CategoryControlPanel from './category-editor/CategoryControlPanel.jsx';
import { getDescendantCategoryIds } from '@/helpers/categoryHelpers.js';
import { openConfirmModal } from '@/services/modalConfirmService.js';
import { openAlertModal } from '@/services/modalAlertService.js';
import { sendCategoryDeleteRequest } from '@/api/categoryRequests.js';
import { pluralize } from '@/helpers/textHelpers.js';
import { logRequestStatus } from '@/helpers/requestLogger.js';
import { UNSORTED_CATEGORY_SLUG, CLIENT_CONSTANTS } from '@shared/constants.js';

const { REQUEST_STATUS, NO_VALUE_LABEL } = CLIENT_CONSTANTS;
 
export default function CategoryEditor({
    loadStatus,
    uiBlocked,
    setOperationBusy,
    categoryTree,
    categoryMap,
    selectedCategoryId,
    setSelectedCategoryId,
    loadCategories,
    shouldProductsLoad,
    setShouldProductsLoad
}) {
    const movedProductCountOnCategoryDeletionRef = useRef(0);
    const isUnmountedRef = useRef(false);
    const dispatch = useDispatch();

    const selectedCategory = categoryMap[selectedCategoryId];

    const descendantCategoryIds = useMemo(
        () => getDescendantCategoryIds(selectedCategory),
        [selectedCategoryId, categoryMap]
    );
    const unsortedCategory = useMemo(
        () => categoryTree.find(cat => cat.slug === UNSORTED_CATEGORY_SLUG),
        [categoryTree]
    );

    const processCategoryForm = async (performFormSubmission) => {
        setOperationBusy(true);

        const responseData = await performFormSubmission();
        if (isUnmountedRef.current) return;

        const { status, finalizeSuccessHandling, newCategoryId, movedProductCount } = responseData;

        if (status === REQUEST_STATUS.SUCCESS) {
            await loadCategories();
            if (isUnmountedRef.current) return;

            finalizeSuccessHandling();
            if (newCategoryId) setSelectedCategoryId(newCategoryId);

            if (movedProductCount > 0) {
                const товар = pluralize(movedProductCount, ['товар', 'товара', 'товаров']);
                const находившийся = pluralize(movedProductCount, ['находившийся', 'находившихся',
                    'находившихся']);
                const был = pluralize(movedProductCount, ['был', 'были', 'были']);
                const перемещён = pluralize(movedProductCount, ['перемещён', 'перемещены',
                    'перемещены']);

                openAlertModal({
                    type: 'warning',
                    dismissible: false,
                    title: 'Внимание!',
                    message:
                        `В связи с изменением структуры категорий, ` +
                        `${movedProductCount} ${товар}, ранее ${находившийся} в категории, ` +
                        `ставшей родительской, ${был} ${перемещён} в корневую категорию ` +
                        `«${unsortedCategory?.name || NO_VALUE_LABEL}».`
                });
            }
        }

        setOperationBusy(false);
    };

    const confirmCategoryDeletion = () => {
        const categoryDeletionPrompt =
            `Категория товаров «${selectedCategory?.name || NO_VALUE_LABEL}» будет удалена` +
            (descendantCategoryIds.length
                ? ` вместе со всеми её подкатегориями (${descendantCategoryIds.length}):\n\n"` +
                    descendantCategoryIds
                        .map(d => categoryMap[d]?.name || NO_VALUE_LABEL)
                        .join('",\n"') +
                    '".\n\n'
                : '.\n\n') +
            `Все товары из ${descendantCategoryIds.length ? 'этих категорий' : 'этой категории'} ` +
            `будут перемещены в корневую категорию «${unsortedCategory?.name || NO_VALUE_LABEL}».\n\n` +
            'Подтвердить выполнение?'; 

        const processCategoryDeletion = async (categoryId) => {
            setOperationBusy(true);

            const responseData = await dispatch(sendCategoryDeleteRequest(categoryId));
            if (isUnmountedRef.current) return;

            const { status, message, movedProductCount } = responseData;

            logRequestStatus({ context: 'CATEGORY: DELETE', status, message });
    
            const isAllowed = [REQUEST_STATUS.SUCCESS, REQUEST_STATUS.NOT_FOUND].includes(status);
            if (!isAllowed) {
                setOperationBusy(false);
                throw new Error(message);
            }
    
            movedProductCountOnCategoryDeletionRef.current = movedProductCount;
        };
    
        const finalizeCategoryDeletion = async (categoryId) => {
            const parentCategory = categoryMap[categoryId]?.parent || '';

            await loadCategories();
            if (isUnmountedRef.current) return;

            const movedProductCount = movedProductCountOnCategoryDeletionRef.current;

            if (movedProductCount > 0) {
                const товар = pluralize(movedProductCount, ['товар', 'товара', 'товаров']);
                const содержащийся = pluralize(movedProductCount, ['содержащийся', 'содержащихся',
                    'содержащихся']);
                const был = pluralize(movedProductCount, ['был', 'были', 'были']);
                const перемещён = pluralize(movedProductCount, ['перемещён', 'перемещены',
                    'перемещены']);

                openAlertModal({
                    type: 'warning',
                    dismissible: false,
                    title: 'Внимание!',
                    message:
                        `При удалении категории или всей её ветки ${movedProductCount} ${товар}, ` +
                        `${содержащийся} в этих категориях, ${был} ${перемещён} ` +
                        `в корневую категорию «${unsortedCategory?.name || NO_VALUE_LABEL}».`
                });

                movedProductCountOnCategoryDeletionRef.current = 0;
            }

            setSelectedCategoryId(parentCategory);
            setOperationBusy(false);
        };

        openConfirmModal({
            prompt: categoryDeletionPrompt,
            onConfirm: () => processCategoryDeletion(selectedCategoryId),
            onFinalize: () => finalizeCategoryDeletion(selectedCategoryId)
        });
    };

    // Очистка при размонтировании
    useEffect(() => {
        return () => {
            isUnmountedRef.current = true;
        };
    }, []);

    return (
        <div className="category-editor">
            <CategorySelection
                loadStatus={loadStatus}
                uiBlocked={uiBlocked}
                categoryTree={categoryTree}
                categoryMap={categoryMap}
                selectedCategoryId={selectedCategoryId}
                setSelectedCategoryId={setSelectedCategoryId}
                loadCategories={loadCategories}
                shouldProductsLoad={shouldProductsLoad}
                setShouldProductsLoad={setShouldProductsLoad}
            />

            <CategoryInfoPanel
                categoryMap={categoryMap}
                selectedCategoryId={selectedCategoryId}
            />

            <CategoryControlPanel
                uiBlocked={uiBlocked}
                setOperationBusy={setOperationBusy}
                categoryTree={categoryTree}
                categoryMap={categoryMap}
                selectedCategoryId={selectedCategoryId}
                setSelectedCategoryId={setSelectedCategoryId}
                loadCategories={loadCategories}
                processCategoryForm={processCategoryForm}
                confirmCategoryDeletion={confirmCategoryDeletion}
            />
        </div>
    );
};
