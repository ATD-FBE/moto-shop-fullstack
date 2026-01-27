import React, { useState, useRef, useMemo, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useLocation, useNavigate } from 'react-router-dom';
import Categories from './catalog/Categories.jsx';
import Products from './catalog/Products.jsx';
import {
    getInitFilterParams,
    getInitSortParam,
    getInitPageParam,
    getInitLimitParam,
    getInitCategoryParams
} from '@/helpers/initParamsHelper.js';
import { productsFilterOptions } from '@shared/filterOptions.js';
import { productsSortOptions } from '@shared/sortOptions.js';
import { productsPageLimitOptions } from '@shared/pageLimitOptions.js';
import { sendCategoryListRequest } from '@/api/categoryRequests.js';
import { sendProductListRequest } from '@/api/productRequests.js';
import { buildCategoryTreeAndMap } from '@/helpers/categoryHelpers.js';
import { reconcileCartWithProducts } from '@/services/cartService.js';
import { logRequestStatus } from '@/helpers/requestLogger.js';
import { DATA_LOAD_STATUS, REQUEST_STATUS } from '@shared/constants.js';

export default function Catalog() {
    const isAuthenticated = useSelector(state => state.auth.isAuthenticated);

    const [initialized, setInitialized] = useState(false);

    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState(new URLSearchParams());
    const [sort, setSort] = useState(productsSortOptions[0].dbField);
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(productsPageLimitOptions[0]);

    const [initCategoriesReady, setInitCategoriesReady] = useState(false);
    const [categoriesLoading, setCategoriesLoading] = useState(true);
    const [categoriesLoadError, setCategoriesLoadError] = useState(false);
    const [flatCategoryList, setFlatCategoryList] = useState([]);
    const [selectedCategoryId, setSelectedCategoryId] = useState('');

    const [initProductsReady, setInitProductsReady] = useState(false);
    const [productsLoading, setProductsLoading] = useState(true);
    const [productsLoadError, setProductsLoadError] = useState(false);
    const [totalProducts, setTotalProducts] = useState(0);
    const [paginatedProductList, setPaginatedProductList] = useState([]);

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
        productsLoading
            ? DATA_LOAD_STATUS.LOADING
            : productsLoadError
                ? DATA_LOAD_STATUS.ERROR
                : !totalProducts
                    ? DATA_LOAD_STATUS.NOT_FOUND
                    : DATA_LOAD_STATUS.READY;

    const isProductUiBlocked = categoriesLoadError || productsLoading || productsLoadError;

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

        const pageContext = 'catalog';
        const responseData = await dispatch(
            sendProductListRequest(isAuthenticated, pageContext, urlParams)
        );
        if (isUnmountedRef.current) return;

        const { status, message, productCount, paginatedProductList } = responseData;
        logRequestStatus({ context: 'PRODUCT: LOAD LIST', status, message });

        if (status !== REQUEST_STATUS.SUCCESS) {
            setProductsLoadError(true);
        } else {
            setTotalProducts(productCount);
            setPaginatedProductList(paginatedProductList);
            setInitProductsReady(true);
            dispatch(reconcileCartWithProducts(paginatedProductList));
        }
        
        setProductsLoading(false);
    };

    const reloadProducts = async () => {
        const urlParams = location.search.slice(1);
        await loadProducts(urlParams);
    };

    // Стартовая загрузка списка категорий и очистка при размонтировании
    useEffect(() => {
        loadCategories();

        return () => {
            isUnmountedRef.current = true;
        };
    }, []);

    // Установка начальных значений параметров компонента после загрузки категорий
    useEffect(() => {
        if (initialized || !initCategoriesReady) return;
    
        const params = new URLSearchParams(location.search);

        setSelectedCategoryId(getInitCategoryParams(params, categoryMap));
        setSearch(params.get('search') || '');
        setFilter(getInitFilterParams(params, productsFilterOptions));
        setSort(getInitSortParam(params, productsSortOptions));
        setPage(getInitPageParam(params));
        setLimit(getInitLimitParam(params, productsPageLimitOptions));

        setInitialized(true);
    }, [initCategoriesReady, categoryMap]);

    // Обновление URL и загрузка товаров с обновлёнными параметрами
    useEffect(() => {
        if (!initialized) return;

        const category = selectedCategoryId && categoryMap[selectedCategoryId]
            ? `${categoryMap[selectedCategoryId].slug}-${selectedCategoryId}`
            : '';
            
        const params = new URLSearchParams({ category, search, sort, page, limit });
        filter.forEach((value, key) => params.append(key, value));

        const urlParams = params.toString();

        if (location.search !== `?${urlParams}`) {
            const newUrl = `${location.pathname}?${urlParams}`;
            navigate(newUrl, { replace: true });
        }

        loadProducts(urlParams);
    }, [initialized, selectedCategoryId, search, filter, sort, page, limit]);

    return (
        <div className="catalog-page">
            <header className="catalog-header">
                <h2>Каталог товаров магазина</h2>
            </header>

            <div className="catalog-main">
                <Categories
                    loadStatus={categoriesLoadStatus}
                    reloadCategories={loadCategories}
                    categoryTree={categoryTree}
                    selectedCategoryId={selectedCategoryId}
                    setSelectedCategoryId={setSelectedCategoryId}
                />

                {initialized && (
                    <Products
                        loadStatus={productsLoadStatus}
                        reloadProducts={reloadProducts}
                        uiBlocked={isProductUiBlocked}
                        paginatedProductList={paginatedProductList}
                        totalProducts={totalProducts}
                        initDataReady={initProductsReady}
                        search={search}
                        setSearch={setSearch}
                        filter={filter}
                        setFilter={setFilter}
                        filterOptions={productsFilterOptions}
                        sort={sort}
                        setSort={setSort}
                        sortOptions={productsSortOptions}
                        page={page}
                        setPage={setPage}
                        limit={limit}
                        setLimit={setLimit}
                        limitOptions={productsPageLimitOptions}
                    />
                )}
            </div>
        </div>
    );
};
