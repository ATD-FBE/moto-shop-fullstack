import React, { useState, useRef, useMemo, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useLocation, useNavigate } from 'react-router-dom';
import CategoryEditor from './catalog-management/CategoryEditor.jsx';
import ProductEditor from './catalog-management/ProductEditor.jsx';
import { sendCategoryListRequest } from '@/api/categoryRequests.js';
import { sendProductListRequest } from '@/api/productRequests.js';
import { upsertProductsInStore } from '@/redux/slices/productsSlice.js';
import {
    getInitFilterParams,
    getInitSortParam,
    getInitPageParam,
    getInitLimitParam,
    getInitCategoryParams
} from '@/helpers/initParamsHelper.js';
import { buildCategoryTreeAndMap } from '@/helpers/categoryHelpers.js';
import { logRequestStatus } from '@/helpers/requestLogger.js';
import { productEditorFilterOptions } from '@shared/filterOptions.js';
import { productEditorSortOptions } from '@shared/sortOptions.js';
import { productEditorPageLimitOptions } from '@shared/pageLimitOptions.js';
import { trimSetByFilter } from '@shared/commonHelpers.js';
import { DATA_LOAD_STATUS, REQUEST_STATUS } from '@shared/constants.js';

export default function CatalogManagement() {
    const isAuthenticated = useSelector(state => state.auth.isAuthenticated);

    const [initialized, setInitialized] = useState(false);

    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState(new URLSearchParams());
    const [sort, setSort] = useState(productEditorSortOptions[0].dbField);
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(productEditorPageLimitOptions[0]);

    const [initCategoriesReady, setInitCategoriesReady] = useState(false);
    const [categoriesLoading, setCategoriesLoading] = useState(true);
    const [categoriesLoadError, setCategoriesLoadError] = useState(false);
    const [categoryOperationBusy, setCategoryOperationBusy] = useState(false);
    const [flatCategoryList, setFlatCategoryList] = useState([]);
    const [selectedCategoryId, setSelectedCategoryId] = useState('');

    const [initProductsReady, setInitProductsReady] = useState(false);
    const [shouldProductsLoad, setShouldProductsLoad] = useState(false);
    const [productsLoading, setProductsLoading] = useState(false);
    const [productsLoadError, setProductsLoadError] = useState(false);
    const [productOperationBusy, setProductOperationBusy] = useState(false);
    const [filteredProductIds, setFilteredProductIds] = useState(new Set());
    const [paginatedProductList, setPaginatedProductList] = useState([]);
    const [selectedProductIds, setSelectedProductIds] = useState(new Set());
    const [expandedProductIds, setExpandedProductIds] = useState(new Set());

    const isUnmountedRef = useRef(false);

    const dispatch = useDispatch();
    const location = useLocation();
    const navigate = useNavigate();

    const { categoryTree, categoryMap } = useMemo(
        () => buildCategoryTreeAndMap(flatCategoryList),
        [flatCategoryList] 
    );

    const categoriesLoadStatus =
        categoriesLoading
            ? DATA_LOAD_STATUS.LOADING
            : categoriesLoadError
                ? DATA_LOAD_STATUS.ERROR
                : DATA_LOAD_STATUS.READY;
    
    const productsLoadStatus =
        !shouldProductsLoad
            ? DATA_LOAD_STATUS.SKIPPED
            : productsLoading
                ? DATA_LOAD_STATUS.LOADING
                : productsLoadError
                    ? DATA_LOAD_STATUS.ERROR
                    : !filteredProductIds.size
                        ? DATA_LOAD_STATUS.NOT_FOUND
                        : DATA_LOAD_STATUS.READY;

    const isCategoryUiBlocked =
        categoriesLoading ||
        categoriesLoadError ||
        categoryOperationBusy ||
        productOperationBusy;

    const isProductUiBlocked =
        productsLoading ||
        productsLoadError ||
        productOperationBusy ||
        categoryOperationBusy;

    const loadCategories = async () => {
        setCategoriesLoadError(false);
        setCategoriesLoading(true);

        const { status, message, categoryList } = await dispatch(sendCategoryListRequest());
        if (isUnmountedRef.current) return;

        logRequestStatus({ context: 'CATEGORY: LOAD LIST', status, message });

        if (status !== REQUEST_STATUS.SUCCESS) {
            setCategoriesLoadError(true);
        } else {
            setFlatCategoryList(categoryList);
            setInitCategoriesReady(true);
        }

        setCategoriesLoading(false);
    };

    const loadProducts = async (urlParams) => {
        setProductsLoadError(false);
        setProductsLoading(true);

        const pageContext = 'catalogManagement';
        const responseData = await dispatch(
            sendProductListRequest(isAuthenticated, pageContext, urlParams)
        );
        if (isUnmountedRef.current) return;

        const { status, message, filteredProductIdList, paginatedProductList } = responseData;
        logRequestStatus({ context: 'PRODUCT: LOAD LIST', status, message });

        if (status !== REQUEST_STATUS.SUCCESS) {
            unloadProducts();
            setProductsLoadError(true);
        } else {
            setFilteredProductIds(new Set(filteredProductIdList));
            setPaginatedProductList(paginatedProductList);
            setInitProductsReady(true);
            dispatch(upsertProductsInStore(paginatedProductList));
        }
        
        setProductsLoading(false);
    };

    const reloadProducts = async () => {
        const urlParams = location.search.slice(1);
        const fetchParams = new URLSearchParams(urlParams);
        
        fetchParams.delete('products');
        await loadProducts(fetchParams.toString());
    };

    const unloadProducts = ({ resetPage } = {}) => {
        setFilteredProductIds(new Set());
        setPaginatedProductList([]);
        if (resetPage) setPage(1);
    };

    const toggleAllProductSelection = async (areAllProductsSelected) => {
        if (!filteredProductIds.size) return;
        setSelectedProductIds(new Set(areAllProductsSelected ? [] : filteredProductIds));
    };

    const toggleProductSelection = (id) => {
        setSelectedProductIds(prev => {
            const newSelection = new Set(prev);

            if (newSelection.has(id)) {
                newSelection.delete(id);
            } else {
                newSelection.add(id);
            }
    
            return newSelection;
        });
    };

    const toggleProductExpansion = (id) => {
        setExpandedProductIds(prev => {
            const newExpandedSet = new Set(prev);

            if (newExpandedSet.has(id)) {
                newExpandedSet.delete(id);
            } else {
                newExpandedSet.add(id);
            }

            return newExpandedSet;
        });
    };

    // Стартовая загрузка списка категорий и очистка при размонтировании
    useEffect(() => {
        loadCategories();

        return () => {
            isUnmountedRef.current = true;
        };
    }, []);

    // Установка начальных значений параметров после первой загрузки категорий
    useEffect(() => {
        if (initialized || !initCategoriesReady) return;
    
        const params = new URLSearchParams(location.search);
        const shouldProductsLoad = params.get('products') === 'true';

        setSelectedCategoryId(getInitCategoryParams(params, categoryMap));
        setShouldProductsLoad(shouldProductsLoad);
        setSearch(params.get('search') || '');
        setFilter(getInitFilterParams(params, productEditorFilterOptions));
        setSort(getInitSortParam(params, productEditorSortOptions));
        setPage(getInitPageParam(params));
        setLimit(getInitLimitParam(params, productEditorPageLimitOptions));

        if (shouldProductsLoad) setProductsLoading(true);
        setInitialized(true);
    }, [initCategoriesReady, categoryMap]);

    // Обновление параметров в URL и загрузка/выгрузка товаров
    useEffect(() => {
        if (!initialized) return;

        const category = selectedCategoryId && categoryMap[selectedCategoryId]
            ? `${categoryMap[selectedCategoryId].slug}~${selectedCategoryId}`
            : '';
        const products = shouldProductsLoad;

        const params = new URLSearchParams({ category, products, search, sort, page, limit });
        filter.forEach((value, key) => params.append(key, value));

        const urlParams = params.toString();

        if (location.search !== `?${urlParams}`) {
            const newUrl = `${location.pathname}?${urlParams}`;
            navigate(newUrl, { replace: true });
        }

        if (shouldProductsLoad) {
            const fetchParams = new URLSearchParams(params);
            fetchParams.delete('products');
            loadProducts(fetchParams.toString());
        } else {
            unloadProducts({ resetPage: true });
        }
    }, [
        initialized,
        categoryMap,
        selectedCategoryId,
        shouldProductsLoad,
        search,
        filter,
        sort,
        page,
        limit
    ]);

    // Удаление отсутствующих в загруженной выборке товаров из выбранных и раскрытых ранее
    useEffect(() => {
        const [trimmedSelected, selectedChanged] =
            trimSetByFilter(selectedProductIds, filteredProductIds);
        const [trimmedExpanded, expandedChanged] =
            trimSetByFilter(expandedProductIds, filteredProductIds);
    
        if (selectedChanged) setSelectedProductIds(trimmedSelected);
        if (expandedChanged) setExpandedProductIds(trimmedExpanded);
    }, [filteredProductIds]);
    
    return (
        <div className="catalog-management-page">
            <header className="catalog-management-header">
                <h2>Управление каталогом магазина</h2>
                <p>Создание, редактирование и удаление категорий и товаров</p>
            </header>

            <CategoryEditor
                loadStatus={categoriesLoadStatus}
                uiBlocked={isCategoryUiBlocked}
                setOperationBusy={setCategoryOperationBusy}
                setFlatCategoryList={setFlatCategoryList}
                categoryMap={categoryMap}
                categoryTree={categoryTree}
                selectedCategoryId={selectedCategoryId}
                setSelectedCategoryId={setSelectedCategoryId}
                loadCategories={loadCategories}
                shouldProductsLoad={shouldProductsLoad}
                setShouldProductsLoad={setShouldProductsLoad}
            />

            {initialized && (
                <ProductEditor
                    loadStatus={productsLoadStatus}
                    uiBlocked={isProductUiBlocked}
                    categoryTree={categoryTree}
                    initDataReady={initProductsReady}
                    search={search}
                    setSearch={setSearch}
                    filter={filter}
                    setFilter={setFilter}
                    filterOptions={productEditorFilterOptions}
                    sort={sort}
                    setSort={setSort}
                    sortOptions={productEditorSortOptions}
                    page={page}
                    setPage={setPage}
                    limit={limit}
                    setLimit={setLimit}
                    limitOptions={productEditorPageLimitOptions}
                    paginatedProductList={paginatedProductList}
                    filteredProductIds={filteredProductIds}
                    selectedProductIds={selectedProductIds}
                    expandedProductIds={expandedProductIds}
                    toggleAllProductSelection={toggleAllProductSelection}
                    toggleProductSelection={toggleProductSelection}
                    toggleProductExpansion={toggleProductExpansion}
                    setOperationBusy={setProductOperationBusy}
                    shouldProductsLoad={shouldProductsLoad}
                    reloadProducts={reloadProducts}
                />
            )}
        </div>
    );
};
