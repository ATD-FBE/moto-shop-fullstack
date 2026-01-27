import React, { useState, useRef, useEffect } from 'react';
import { useSelector } from 'react-redux';
import cn from 'classnames';
import Toolbar from '@/components/common/Toolbar.jsx';
import TrackedImage from '@/components/common/TrackedImage.jsx';
import BlockableLink from '@/components/common/BlockableLink.jsx';
import ProductQuantitySelector from '@/components/common/ProductQuantitySelector.jsx';
import ZoomController from '@/components/common/ZoomController.jsx';
import { routeConfig } from '@/config/appRouting.js';
import { formatProductTitle, formatCurrency } from '@/helpers/textHelpers.js';
import generateSlug from '@/helpers/generateSlug.js';
import { CLIENT_CONSTANTS } from '@shared/constants.js';

const { LOAD_STATUS_MIN_HEIGHT, DATA_LOAD_STATUS, PRODUCT_IMAGE_PLACEHOLDER } = CLIENT_CONSTANTS;

export default function Products({
    loadStatus,
    reloadProducts,
    paginatedProductList,
    totalProducts,
    uiBlocked,
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
    limitOptions
}) {
    const isTouchDevice = useSelector(state => state.ui.isTouchDevice);
    const { isAuthenticated, user } = useSelector(state => state.auth);

    const userRole = user?.role ?? 'guest';
    const customerDiscount = user?.discount ?? 0;

    return (
        <div className="products">
            <header className="products-header">
                <h3>Товары магазина</h3>
            </header>

            <Toolbar
                position="top"
                activeControls={['limit', 'sort', 'search', 'filter', 'pages']}
                uiBlocked={uiBlocked}
                initDataReady={initDataReady}
                search={search}
                setSearch={setSearch}
                searchPlaceholder="По артикулу, наименованию, бренду или тегам товара"
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
                totalItems={totalProducts}
            />

            <ProductsMain
                loadStatus={loadStatus}
                reloadProducts={reloadProducts}
                paginatedProductList={paginatedProductList}
                isTouchDevice={isTouchDevice}
                isAuthenticated={isAuthenticated}
                userRole={userRole}
                customerDiscount={customerDiscount}
                uiBlocked={uiBlocked}
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
                totalItems={totalProducts}
                label="Товары"
            />
        </div>
    );
};

function ProductsMain({
    loadStatus,
    reloadProducts,
    paginatedProductList,
    isTouchDevice,
    isAuthenticated,
    userRole,
    customerDiscount,
    uiBlocked
}) {
    const [listMainHeight, setListMainHeight] = useState(LOAD_STATUS_MIN_HEIGHT);
    const listMainRef = useRef(null);

    useEffect(() => {
        if (!listMainRef.current) return;
        
        const newHeight = listMainRef.current.offsetHeight;
        if (newHeight !== listMainHeight) setListMainHeight(newHeight);
    }, [loadStatus]);

    if (loadStatus === DATA_LOAD_STATUS.LOADING) {
        return (
            <div
                className="products-main"
                style={{ height: Math.max(LOAD_STATUS_MIN_HEIGHT, listMainHeight) }}
            >
                <div className="products-load-status">
                    <p>
                        <span className="icon load">⏳</span>
                        Загрузка товаров...
                    </p>
                </div>
            </div>
        );
    }

    if (loadStatus === DATA_LOAD_STATUS.ERROR) {
        return (
            <div
                ref={listMainRef}
                className="products-main"
                style={{ height: LOAD_STATUS_MIN_HEIGHT }}
            >
                <div className="products-load-status">
                    <p>
                        <span className="icon error">❌</span>
                        Ошибка сервера. Товары не доступны.
                    </p>
                    <button className="reload-btn" onClick={reloadProducts}>Повторить</button>
                </div>
            </div>
        );
    }

    if (loadStatus === DATA_LOAD_STATUS.NOT_FOUND) {
        return (
            <div
                ref={listMainRef}
                className="products-main"
                style={{ height: LOAD_STATUS_MIN_HEIGHT }}
            >
                <div className="products-load-status">
                    <p>
                        <span className="icon not-found">🔎</span>
                        Товары не найдены.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div ref={listMainRef} className="products-main">
            <ul className="product-list">
                {paginatedProductList.map(product => (
                    <li key={product.id} className="product-item">
                        <ProductCard
                            product={product}
                            isTouchDevice={isTouchDevice}
                            isAuthenticated={isAuthenticated}
                            userRole={userRole}
                            customerDiscount={customerDiscount}
                            uiBlocked={uiBlocked}
                        />
                    </li>
                ))}
            </ul>
        </div>
    );
}

function ProductCard({
    product,
    isTouchDevice,
    isAuthenticated,
    userRole,
    customerDiscount,
    uiBlocked
}) {
    const cartState = useSelector(state => state.cart);
    const thumbImageRef = useRef(null);
    const thumbRef = useRef(null);

    const {
        id, images, mainImageIndex, sku, name, brand, available,
        isBrandNew, isRestocked, unit, price, discount: productDiscount, isActive
    } = product;

    const showCartControls =
        ['guest', 'customer'].includes(userRole) &&
        cartState.isAccessible &&
        available > 0 &&
        isActive;

    const cartItem = cartState.byId[id];
    const quantity = cartItem?.quantity ?? 0;
    const quantityReduced = cartItem?.quantityReduced ?? false;

    const title = formatProductTitle(name, brand);
    const slug = generateSlug(title);
    const productUrl = routeConfig.productDetails.generatePath({ slug, sku, productId: id });

    const hasImages = images.length > 0;
    const thumbImageSrc = hasImages
        ? (images[mainImageIndex] ?? images[0]).thumbnails.medium
        : PRODUCT_IMAGE_PLACEHOLDER;
    const thumbImageAlt = hasImages ? title : '';

    const effectiveDiscount = Math.max(productDiscount, customerDiscount);
    const hasDiscount = effectiveDiscount > 0;
    const currentPrice = hasDiscount ? price * (1 - effectiveDiscount / 100) : price;

    const formattedOriginalPrice = formatCurrency(price);
    const formattedCurrentPrice = formatCurrency(currentPrice);

    return (
        <article data-id={id} className="product-card">
            <div ref={thumbRef} className="product-thumb">
                <BlockableLink to={productUrl}>
                    <TrackedImage
                        ref={thumbImageRef}
                        className="product-thumb-img"
                        src={thumbImageSrc}
                        alt={thumbImageAlt}
                    />
                    {hasImages && (
                        <ZoomController
                            thumbImageRef={thumbImageRef}
                            zoomAnchorRef={thumbRef}
                            originalImageSrc={images[mainImageIndex].original}
                            zoomFactor={0.6}
                        />
                    )}
                </BlockableLink>
            </div>

            <div className="product-title">
                {/* Визуальный слой */}
                <div className="product-title-visual">
                    {isBrandNew && (
                        <p className="badge"><span className="brand-new">Новинка!</span></p>
                    )}
                    <p className="title">{title}</p>
                </div>

                {/* Интерактивный слой */}
                <BlockableLink to={productUrl}>
                    {isBrandNew && (
                        <p className="badge"><span className="brand-new">Новинка!</span></p>
                    )}
                    <p className="title">{title}</p>
                </BlockableLink>
            </div>

            <div className="product-prices">
                {hasDiscount && isActive && (
                    <p className="discount-info">
                        <span className="original-price">{formattedOriginalPrice} руб./{unit}</span>
                        <span className="discount">-{effectiveDiscount}%</span>
                    </p>
                )}
                
                <p className="current-price">
                    {isActive ? formattedCurrentPrice : formattedOriginalPrice}
                    <span className="price-unit"> руб./{unit}</span>
                </p>
            </div>

            <div className="product-info">
                {isActive ? (
                    <div className={cn('product-available', { 'out-of-stock': !available })}>
                        <p>
                            <span className="icon">{available > 0 ? '✔' : '❌'}</span>
                            {available > 0 ? `В наличии (${available})` : 'Нет в наличии'}
                        </p>
                        {isRestocked && <p className="restock"> → поступление</p>}
                    </div>
                ) : (
                    <div className="product-inactive">
                        <span className="icon">🔒</span>
                        Не продаётся
                    </div>
                )}
                
                <div className="product-sku">
                    {sku}
                </div>
            </div>

            {showCartControls && (
                <ProductQuantitySelector
                    id={id}
                    availableQuantity={available}
                    orderedQuantity={quantity}
                    quantityReduced={quantityReduced}
                    isTouchDevice={isTouchDevice}
                    isAuthenticated={isAuthenticated}
                    uiBlocked={uiBlocked}
                />
            )}
        </article>
    );
}
