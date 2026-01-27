import React, { useRef, useMemo, useEffect } from 'react';
import { useDispatch } from 'react-redux';
import Toolbar from '@/components/common/Toolbar.jsx';
import ProductTable from './product-editor/ProductTable.jsx';
import ProductCreationPanel from './product-editor/ProductCreationPanel.jsx';
import { openConfirmModal } from '@/services/modalConfirmService.js';
import { getLeafCategories } from '@/helpers/categoryHelpers.js';
import { sendProductDeleteRequest, sendBulkProductDeleteRequest } from '@/api/productRequests.js';
import { upsertProductsInStore, removeProductsFromStore } from '@/redux/slices/productsSlice.js';
import { logRequestStatus } from '@/helpers/requestLogger.js';
import { REQUEST_STATUS } from '@shared/constants.js';
 
export default function ProductEditor({
    loadStatus,
    uiBlocked,
    categoryTree,
    initDataReady,
    search,
    setSearch,
    filter,
    setFilter,
    filterOptions,
    sort,
    setSort,
    sortOptions,
    page,
    setPage,
    limit,
    setLimit,
    limitOptions,
    paginatedProductList,
    filteredProductIds,
    selectedProductIds,
    expandedProductIds,
    toggleAllProductSelection,
    toggleProductSelection,
    toggleProductExpansion,
    setOperationBusy,
    shouldProductsLoad,
    reloadProducts
}) {
    const isUnmountedRef = useRef(false);
    const dispatch = useDispatch();

    const productLeafCategories = useMemo(() => getLeafCategories(categoryTree), [categoryTree]);

    const processProductForm = async (performFormSubmission) => {
        setOperationBusy(true);

        const { status, affectedProducts } = await performFormSubmission();
        if (isUnmountedRef.current) return;

        const { SUCCESS, PARTIAL } = REQUEST_STATUS;
        const isAllowed = [SUCCESS, PARTIAL].includes(status);
        if (isAllowed) {
            dispatch(upsertProductsInStore(affectedProducts));

            if (shouldProductsLoad) {
                await reloadProducts();
                if (isUnmountedRef.current) return;
            }
        }

        setOperationBusy(false);
    };

    const confirmProductDeletion = (product) => {
        if (!product) return;

        const processProductDeletion = async (productId) => {
            setOperationBusy(true);

            const { status, message } = await dispatch(sendProductDeleteRequest(productId));
            if (isUnmountedRef.current) return;
    
            logRequestStatus({ context: 'PRODUCT: DELETE SINGLE', status, message });
    
            const { SUCCESS, NOT_FOUND } = REQUEST_STATUS;
            const isAllowed = [SUCCESS, NOT_FOUND].includes(status);
            if (!isAllowed) {
                setOperationBusy(false);
                throw new Error(message);
            }

            dispatch(removeProductsFromStore([productId]));
        };

        const finalizeProductDeletion = async () => {
            if (shouldProductsLoad) {
                await reloadProducts();
                if (isUnmountedRef.current) return;
            }

            setOperationBusy(false);
        };

        openConfirmModal({
            prompt: `Товар «${product.name}» будет удалён.\n\nПодтвердить выполнение?`,
            onConfirm: () => processProductDeletion(product.id),
            onFinalize: finalizeProductDeletion
        });
    };

    const confirmBulkProductDeletion = async (productIds) => {
        if (!productIds || !productIds.length) return;

        const processBulkProductDeletions = async (productIds) => {
            setOperationBusy(true);

            const { status, message } = await dispatch(sendBulkProductDeleteRequest(productIds));
            if (isUnmountedRef.current) return;
            
            logRequestStatus({ context: 'PRODUCT: DELETE BULK', status, message });
    
            const { SUCCESS, PARTIAL, NOT_FOUND } = REQUEST_STATUS;
            const isAllowed = [SUCCESS, PARTIAL, NOT_FOUND].includes(status);
            if (!isAllowed) {
                setOperationBusy(false);
                throw new Error(message);
            }
    
            dispatch(removeProductsFromStore(productIds));
        };

        const finalizeBulkProductDeletion = async () => {
            if (shouldProductsLoad) {
                await reloadProducts();
                if (isUnmountedRef.current) return;
            }

            setOperationBusy(false);
        };

        openConfirmModal({
            prompt: 'Выбранные товары будут удалены.\n\nПодтвердить выполнение?',
            onConfirm: () => processBulkProductDeletions(productIds),
            onFinalize: finalizeBulkProductDeletion
        });
    };

    // Очистка при размонтировании
    useEffect(() => {
        return () => {
            isUnmountedRef.current = true;
        };
    }, []);

    return (
        <div className="product-editor">
            <ProductCreationPanel
                uiBlocked={uiBlocked}
                allowedCategories={productLeafCategories}
                onSubmit={processProductForm}
            />

            <div className="product-table-section">
                <Toolbar
                    position="top"
                    activeControls={['limit', 'sort', 'search', 'filter', 'pages']}
                    uiBlocked={uiBlocked}
                    initDataReady={initDataReady}
                    search={search}
                    setSearch={setSearch}
                    searchPlaceholder="По ID, артикулу, наименованию, бренду или тегам товара"
                    filter={filter}
                    setFilter={setFilter}
                    filterOptions={filterOptions}
                    sort={sort}
                    setSort={setSort}
                    sortOptions={sortOptions}
                    page={page}
                    setPage={setPage}
                    limit={limit}
                    setLimit={setLimit}
                    limitOptions={limitOptions}
                    totalItems={filteredProductIds.size}
                />

                <ProductTable
                    loadStatus={loadStatus}
                    uiBlocked={uiBlocked}
                    paginatedItems={paginatedProductList}
                    filteredItems={filteredProductIds}
                    selectedItems={selectedProductIds}
                    expandedItems={expandedProductIds}
                    toggleAllItemSelection={toggleAllProductSelection}
                    toggleItemSelection={toggleProductSelection}
                    toggleItemExpansion={toggleProductExpansion}
                    confirmItemDeletion={confirmProductDeletion}
                    confirmBulkItemDeletion={confirmBulkProductDeletion}
                    reloadItems={reloadProducts}
                    allowedCategories={productLeafCategories}
                    processItemForm={processProductForm}
                    processBulkItemForm={processProductForm}
                />
                
                <Toolbar
                    position="bottom"
                    activeControls={['info', 'pages']}
                    loadStatus={loadStatus}
                    uiBlocked={uiBlocked}
                    initDataReady={initDataReady}
                    page={page}
                    setPage={setPage}
                    limit={limit}
                    totalItems={filteredProductIds.size}
                    label="Товары"
                />
            </div>
        </div>
    );
};
