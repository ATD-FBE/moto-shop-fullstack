import React, { useState, useRef, useMemo, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useLocation, useNavigate } from 'react-router-dom';
import cn from 'classnames';
import Collapsible from '@/components/common/Collapsible.jsx';
import Toolbar from '@/components/common/Toolbar.jsx';
import TrackedImage from '@/components/common/TrackedImage.jsx';
import BlockableLink from '@/components/common/BlockableLink.jsx';
import ProductQuantitySelector from '@/components/common/ProductQuantitySelector.jsx';
import useMeasureMaxWidth from '@/hooks/useMeasureMaxWidth.js';
import useSyncedStateWithRef from '@/hooks/useSyncedStateWithRef.js';
import {
    sendCartItemListRequest,
    sendCartClearRequest,
    sendCartItemRestoreRequest,
    sendCartWarningsFixRequest,
    sendCartItemRemoveRequest
} from '@/api/cartRequests.js';
import { sendOrderDraftCreateRequest } from '@/api/checkoutRequests.js';
import { routeConfig } from '@/config/appRouting.js';
import { clearCart } from '@/redux/slices/cartSlice.js';
import { setLockedRoute } from '@/redux/slices/uiSlice.js';
import { applyCartState, refreshCartTotals, unsetCartItem } from '@/services/cartService.js';
import { formatOrderAdjustmentLogs } from '@/services/checkoutService.js';
import { openConfirmModal } from '@/services/modalConfirmService.js';
import { openAlertModal } from '@/services/modalAlertService.js';
import {
    formatProductTitle,
    formatCurrency,
    pluralize,
    highlightText
} from '@/helpers/textHelpers.js';
import generateSlug from '@/helpers/generateSlug.js';
import { logRequestStatus } from '@/helpers/requestLogger.js';
import { getAppliedDiscountData } from '@shared/commonHelpers.js';
import { CLIENT_CONSTANTS, MIN_ORDER_AMOUNT } from '@shared/constants.js';

const { DATA_LOAD_STATUS, REQUEST_STATUS, SCREEN_SIZE, PRODUCT_IMAGE_PLACEHOLDER } = CLIENT_CONSTANTS;
 
export default function Cart() {
    const { isTouchDevice, screenSize, dashboardPanelActive } = useSelector(state => state.ui);
    const { isAuthenticated, user } = useSelector(state => state.auth);
    const cartState = useSelector(state => state.cart);
    const productMap = useSelector(state => state.products.byId);

    const [initialized, setInitialized] = useState(false);
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState('');

    const [cartLoading, setCartLoading] = useState(true);
    const [cartLoadError, setCartLoadError] = useState(false);
    const [cartItemIdsInProgress, setCartItemIdsInProgress] = useState(new Set());
    const [checkoutInProgress, setCheckoutInProgress] = useState(false);
    const [cartClearing, setCartClearing] = useState(false);
    const [showCartClearAnimation, setShowCartClearAnimation] = useState(false);

    const cartItemRefs = useRef([]);
    const isUnmountedRef = useRef(false);

    const dispatch = useDispatch();
    const location = useLocation();
    const navigate = useNavigate();

    const customerDiscount = user?.discount ?? 0;

    const cartItemList = cartState.ids.map(id => cartState.byId[id]);
    const totalCartItems = cartItemList.length;

    const originalTotal = cartState.rawTotal;
    const currentTotal = cartState.discountedTotal;
    const savedTotal = originalTotal - currentTotal;
    const hasDiscount = savedTotal > 0;
    
    const formattedOriginalTotal = formatCurrency(originalTotal);
    const formattedCurrentTotal = formatCurrency(currentTotal);
    const formattedSavedTotal = formatCurrency(savedTotal);

    const cartLoadStatus =
        cartLoading
            ? DATA_LOAD_STATUS.LOADING
            : cartLoadError
                ? DATA_LOAD_STATUS.ERROR
                : !totalCartItems
                    ? DATA_LOAD_STATUS.NOT_FOUND
                    : DATA_LOAD_STATUS.READY;

    const isCartUiBlocked =
        cartLoading ||
        cartClearing ||
        showCartClearAnimation ||
        cartItemIdsInProgress.size > 0 ||
        checkoutInProgress;

    const { filteredCartItemIdsSet, cartWarningCount } = useMemo(() => {
        let warningCount = 0;

        const filteredCartItemIds = cartItemList.reduce((acc, cartItem) => {
            const product = productMap[cartItem.id];
            if (!product) return acc;

            // Фильтрация по поиску
            const searchLower = search?.trim().toLowerCase();
            const { sku, name, brand } = product;
            const title = formatProductTitle(name, brand);
    
            const matchesSearch = searchLower
                ? [sku, title].some(field => field?.toLowerCase().includes(searchLower))
                : true;
    
            // Фильтрация по проблемным товарам
            const isWarning = cartItem.deleted || cartItem.inactive ||
                cartItem.outOfStock || cartItem.quantityReduced;
            if (isWarning) warningCount++;
    
            const matchesFilter = filter === 'warnings' ? isWarning : true;
    
            // Проверка фильтров
            if (matchesSearch && matchesFilter) {
                acc.push(cartItem.id);
            }
    
            return acc;
        }, []);
    
        return {
            filteredCartItemIdsSet: new Set(filteredCartItemIds),
            cartWarningCount: warningCount
        };
    }, [cartItemList, search, filter]);

    const filteredCartItemsCount = filteredCartItemIdsSet.size;

    const addCartItemInProgress = (id) => {
        setCartItemIdsInProgress(prev => new Set(prev).add(id));
    };
      
    const removeCartItemInProgress = (id) => {
        setCartItemIdsInProgress(prev => {
            const newSet = new Set(prev);
            newSet.delete(id);
            return newSet;
        });
    };

    const loadCart = async () => {
        setCartLoadError(false);
        setCartLoading(true);

        const responseData = await dispatch(sendCartItemListRequest());
        if (isUnmountedRef.current) return;

        const { status, message, purchaseProductList, cartItemList, customerDiscount } = responseData;
        logRequestStatus({ context: 'CART: LOAD', status, message });

        if (status !== REQUEST_STATUS.SUCCESS) {
            setCartLoadError(true);
        } else {
            dispatch(applyCartState(purchaseProductList, cartItemList, customerDiscount));
        }

        setCartLoading(false);
    };

    const createOrderDraft = async () => {
        if (!totalCartItems || cartLoadError) return;

        setCheckoutInProgress(true);

        // Создание снэпшотов критически важных данных черновика заказа для первой проверки изменений
        const cartProductSnapshots = cartItemList.map(item => {
            const product = productMap[item.id];
            const productDiscount = product?.discount ?? 0;
            const {
                appliedDiscount,
                appliedDiscountSource
            } = getAppliedDiscountData(productDiscount, customerDiscount);

            return {
                id: item.id,
                priceSnapshot: product?.price ?? 0,
                appliedDiscountSnapshot: appliedDiscount,
                appliedDiscountSourceSnapshot: appliedDiscountSource
            };
        });

        const responseData = await dispatch(sendOrderDraftCreateRequest(cartProductSnapshots));
        if (isUnmountedRef.current) return;

        const {
            status, message, orderAdjustments, purchaseProductList, cartItemList: newCartItemList,
            customerDiscount: newCustomerDiscount, currentTotal, orderId
        } = responseData;
        logRequestStatus({ context: 'CHECKOUT: CREATE DRAFT ORDER', status, message });

        const hasAdjustments = orderAdjustments?.length > 0;
        const adjustmentsMsg = hasAdjustments
            ? '<span className="bold underline">Изменения товаров в корзине:</span>\n\n' +
                formatOrderAdjustmentLogs(orderAdjustments, productMap)
            : '';

        if (hasAdjustments) {
            dispatch(applyCartState(purchaseProductList, newCartItemList, newCustomerDiscount));
        }

        if (status !== REQUEST_STATUS.SUCCESS) {
            // Сумма заказа меньше минимальной
            if (status === REQUEST_STATUS.LIMITATION) {
                const amountToAdd = Math.max(0, MIN_ORDER_AMOUNT - currentTotal);
                const minOrderAmountMsg =
                    'Сумма заказа после синхронизации с текущими данными каталога ' +
                    'стала меньше минимальной.\n\n' +
                    'Минимальная сумма заказа — ' +
                    `<span className="color-blue">${formatCurrency(MIN_ORDER_AMOUNT)}</span> ₽. ` +
                    'Добавьте товаров ещё на ' +
                    `<span className="color-green">${formatCurrency(amountToAdd)}</span> ₽.`;
                
                openAlertModal({
                    type: 'error',
                    dismissible: false,
                    title: 'Сумма заказа меньше минимальной',
                    message: minOrderAmountMsg + (hasAdjustments ? `\n\n\n${adjustmentsMsg}` : ''),
                    onClose: () => setCheckoutInProgress(false)
                });
                return;
            }
            
            // Ошибка сервера и др.
            openAlertModal({
                type: 'error',
                dismissible: false,
                title: 'Не удалось создать черновик заказа',
                message: 'Ошибка при оформлении заказа.\nПодробности ошибки в консоли.',
                onClose: () => setCheckoutInProgress(false)
            });
            return;
        }

        // Успешный ответ
        const checkoutPath = routeConfig.customerCheckout.generatePath({ orderId });

        if (hasAdjustments) {
            openAlertModal({
                type: 'warning',
                dismissible: false,
                title: 'Корзина была синхронизирована с текущими данными каталога',
                message: adjustmentsMsg,
                onClose: () => dispatch(setLockedRoute(checkoutPath))
            });
        } else {
            dispatch(setLockedRoute(checkoutPath));
        }
    };

    const confirmCartClearing = async () => {
        if (!totalCartItems || cartLoadError) return;

        const cartClearingPrompt =
            'Корзина товаров будет полностью очищена без возможности восстановления.\n' +
            'Продолжить выполнение?';

        const proccessCartClearing = async () => {
            setCartClearing(true);
    
            const { status, message } = await dispatch(sendCartClearRequest());
            if (isUnmountedRef.current) return;
    
            logRequestStatus({ context: 'CART: CLEAR', status, message });
    
            if (status !== REQUEST_STATUS.SUCCESS) {
                setCartClearing(false);
                throw new Error(message);
            }
        };

        const finalizeCartClearing = () => {
            if (isUnmountedRef.current) return;
            
            setCartClearing(false);

            const allCollapsed = cartItemRefs.current.every(el => el?.offsetHeight === 0);

            if (allCollapsed) { // Очистить корзину сразу, т. к. все товары уже свёрнуты
                dispatch(clearCart());
            } else { // Включить анимацию сворачивания товаров и затем очистить корзину
                setShowCartClearAnimation(true);
            }
        };

        openConfirmModal({
            prompt: cartClearingPrompt,
            onConfirm: proccessCartClearing,
            onFinalize: finalizeCartClearing
        });
    };

    const fixCartWarnings = async () => {
        setCartLoadError(false);
        setCartLoading(true);

        const responseData = await dispatch(sendCartWarningsFixRequest());
        if (isUnmountedRef.current) return;

        const { status, message, purchaseProductList, cartItemList, customerDiscount } = responseData;

        logRequestStatus({ context: 'CART: FIX', status, message });

        if (status !== REQUEST_STATUS.SUCCESS) {
            setCartLoadError(true);
        } else {
            dispatch(applyCartState(purchaseProductList, cartItemList, customerDiscount));
        }

        setCartLoading(false);
    };

    const handleShowAllCartItems = (e) => {
        e.preventDefault();
        setFilter('');
    };

    const showWarningCartItems = (e) => {
        e.preventDefault();

        if (!isCartUiBlocked) {
            setFilter('warnings');
            document.activeElement.blur(); // Убрать фокус с уже неактивной кнопки-ссылки, если он был
        }
    };

    const clearTextSelection = () => {
        if (filter === 'warnings') {
            window.getSelection()?.removeAllRanges();
        }
    };

    // Установка начальных значений параметров и очистка при размонтировании
    useEffect(() => {
        const params = new URLSearchParams(location.search);
        setSearch(params.get('search') || '');
        setFilter(params.get('filter') === 'warnings' ? 'warnings' : '');

        setInitialized(true);

        return () => {
            isUnmountedRef.current = true;
        };
    }, []);

    // Загрузка всех товаров корзины (после установки init-параметров)
    useEffect(() => {
        if (!initialized) return;
        loadCart(); // Не зависит от параметров, т. к. фильтрация клиентская
    }, [initialized]);

    // Обновление параметров
    useEffect(() => {
        if (!initialized) return;

        const params = new URLSearchParams({ search, filter });
        const urlParams = params.toString();

        if (location.search !== `?${urlParams}`) {
            const newUrl = `${location.pathname}?${urlParams}`;
            navigate(newUrl, { replace: true });
        }
    }, [initialized, search, filter]);

    // Сброс фильтра warnings, если проблемные товары устранены
    useEffect(() => {
        if (!initialized || cartLoadStatus !== DATA_LOAD_STATUS.READY || cartWarningCount > 0) return;
        setFilter('');
    }, [initialized, cartLoadStatus, cartWarningCount]);

    if (!initialized) return null;

    return (
        <div className="cart-page">
            <header className="cart-header">
                <h2>Корзина покупателя</h2>
                <p>Минимальная сумма заказа — {formatCurrency(MIN_ORDER_AMOUNT)} ₽</p>
            </header>

            <section className={cn(
                'cart-summary-wrapper',
                { 'dashboard-panel-active': dashboardPanelActive }
            )}>
                <div className="cart-summary">
                    <div className="cart-totals">
                        <div className="cart-totals-title-box">
                            <p className="cart-totals-title">Итоговая сумма:</p>
                            <div className="cart-totals-info">
                                <p>Расчёт на момент посещения страницы.</p>
                                <p>Обновите данные для перерасчёта.</p>
                            </div>
                        </div>

                        <div className="cart-total-amounts">
                            {hasDiscount && (
                                <p className="cart-original-total">{formattedOriginalTotal} руб.</p>
                            )}
                            <p className="cart-current-total">{formattedCurrentTotal} руб.</p>
                            {hasDiscount && (
                                <p className="cart-saved-total">
                                    Экономия: {formattedSavedTotal} руб.
                                </p>
                            )}
                        </div>
                    </div>

                    <div className="cart-controls">
                        <button
                            className="update-cart-btn"
                            onClick={loadCart}
                            disabled={isCartUiBlocked}
                            aria-label="Обновить данные"
                        >
                            Обновить данные
                        </button>

                        <button
                            className="place-order-btn"
                            onClick={createOrderDraft}
                            disabled={isCartUiBlocked}
                            aria-label="Оформить заказ"
                        >
                            Начать оформление
                        </button>
                    </div>
                </div>
            </section>

            <section className="cart-main">
                <header className="cart-main-header">
                    <Toolbar
                        activeControls={['search']}
                        uiBlocked={isCartUiBlocked}
                        search={search}
                        setSearch={setSearch}
                        searchPlaceholder="По наименованию или артикулу товара"
                    />

                    <div className="cart-main-controls">
                        <div className="cart-main-info">
                            <p>
                                {'В корзине'}
                                &nbsp;
                                <span className="total-cart-items">{totalCartItems}</span>
                                &nbsp;
                                {pluralize(totalCartItems, [
                                    'товарная позиция',
                                    'товарные позиции',
                                    'товарных позиций'
                                ])}
                                {filteredCartItemsCount < totalCartItems && (
                                    <span>
                                        {' (показано '}
                                        <span className="filtered-cart-items-count">
                                            {filteredCartItemsCount}
                                        </span>
                                        {')'}
                                    </span>
                                )}
                                {cartWarningCount > 0 && filter === 'warnings' && (
                                    <>
                                        :&nbsp;
                                        <BlockableLink
                                            href="#"
                                            role="button"
                                            className="clear-filter-btn text-link-btn"
                                            disabled={isCartUiBlocked}
                                            onClick={handleShowAllCartItems}
                                            aria-label="Показать все товары"
                                        >
                                            Все товары
                                        </BlockableLink>
                                    </>
                                )}
                            </p>

                            {cartWarningCount > 0 && !cartLoading && (
                                <p>
                                    <BlockableLink
                                        href="#"
                                        role="button"
                                        tabIndex={filter === 'warnings' ? -1 : 0}
                                        className={cn('warning-cart-filter-btn', 'text-link-btn', {
                                            'active': filter === 'warnings'
                                        })}
                                        onClick={showWarningCartItems}
                                        onMouseDown={clearTextSelection}
                                        disabled={isCartUiBlocked}
                                        aria-label="Показать проблемные товары"
                                    >
                                        <span className="warning-cart-items-count">
                                            {cartWarningCount}
                                        </span>
                                        &nbsp;
                                        {pluralize(cartWarningCount, [
                                            'позиция требует проверки:',
                                            'позиции требуют проверки:',
                                            'позиций требуют проверки:'
                                        ])}
                                    </BlockableLink>
                                    
                                    <button
                                        className="fix-cart-items-btn"
                                        onClick={fixCartWarnings}
                                        disabled={isCartUiBlocked}
                                        title={'Очистка корзины от удалённых и недоступных товаров,' +
                                            ' автокоррекция количества товаров,' +
                                            ' которых осталось меньше.'}
                                        aria-label="Исправить все проблемные товары в корзине"
                                    >
                                        Исправить всё
                                    </button>
                                </p>
                            )}
                        </div>

                        <button
                            className="clear-cart-btn"
                            onClick={confirmCartClearing}
                            disabled={isCartUiBlocked}
                            aria-label="Очистить корзину"
                        >
                            Очистить корзину
                        </button>
                    </div>
                </header>

                <CartItemList
                    cartItemRefs={cartItemRefs}
                    screenSize={screenSize}
                    loadStatus={cartLoadStatus}
                    reloadCart={loadCart}
                    cartItemList={cartItemList}
                    productMap={productMap}
                    filteredCartItemIdsSet={filteredCartItemIdsSet}
                    searchQuery={search}
                    cartClearing={cartClearing}
                    showCartClearAnimation={showCartClearAnimation}
                    setShowCartClearAnimation={setShowCartClearAnimation}
                    customerDiscount={customerDiscount}
                    isTouchDevice={isTouchDevice}
                    isAuthenticated={isAuthenticated}
                    addCartItemInProgress={addCartItemInProgress}
                    removeCartItemInProgress={removeCartItemInProgress}
                    checkoutInProgress={checkoutInProgress}
                />
            </section>
        </div>
    );
};

function CartItemList({
    cartItemRefs,
    screenSize,
    loadStatus,
    reloadCart,
    cartItemList,
    productMap,
    filteredCartItemIdsSet,
    searchQuery,
    cartClearing,
    showCartClearAnimation,
    setShowCartClearAnimation,
    customerDiscount,
    isTouchDevice,
    isAuthenticated,
    addCartItemInProgress,
    removeCartItemInProgress,
    checkoutInProgress
}) {
    const [visibleCartItems, setVisibleCartItems] = useState({});
    const pricesContentRefsMap = useRef({});
    const totalsContentRefsMap = useRef({});

    const assignRefInArray = (elem, idx, refArray) => {
        if (elem) {
            refArray.current[idx] = elem;
        } else {
            refArray.current.splice(idx, 1);
        }
    };

    const assignRefInMap = (elem, key, refMap) => {
        if (elem) {
            refMap.current[key] = elem;
        } else {
            delete refMap.current[key];
        }
    };

    const onCartItemVisibilityChange = (productId, isVisible) => {
        setVisibleCartItems(prev => {
            if (prev[productId] === isVisible) return prev;
            return { ...prev, [productId]: isVisible };
        });
    };

    const visiblePricesContentElements = useMemo(() => {
        return Object.entries(pricesContentRefsMap.current)
            .map(([id, el]) => (visibleCartItems[id] ? el : null))
            .filter(Boolean);
    }, [visibleCartItems]);
    
    const visibleTotalsContentElements = useMemo(() => {
        return Object.entries(totalsContentRefsMap.current)
            .map(([id, el]) => (visibleCartItems[id] ? el : null))
            .filter(Boolean);
    }, [visibleCartItems]);

    // Расчёт максимальной ширины для колонок товара product-prices и product-total-amounts
    const maxPricesWidth = useMeasureMaxWidth(visiblePricesContentElements, {
        enabled: [SCREEN_SIZE.LARGE].includes(screenSize) && loadStatus === DATA_LOAD_STATUS.READY
    });
    const maxTotalsWidth = useMeasureMaxWidth(visibleTotalsContentElements, {
        enabled:
            [SCREEN_SIZE.MEDIUM, SCREEN_SIZE.LARGE].includes(screenSize) &&
            loadStatus === DATA_LOAD_STATUS.READY
    });

    // Очистка рефов при обновлении данных корзины для пересчёта ширин контента
    useEffect(() => {
        if (loadStatus !== DATA_LOAD_STATUS.LOADING) return;
    
        pricesContentRefsMap.current = {};
        totalsContentRefsMap.current = {};
        setVisibleCartItems({});
    }, [loadStatus]);

    if (loadStatus === DATA_LOAD_STATUS.LOADING) {
        return (
            <div className="cart-load-status">
                <p>
                    <span className="icon load">⏳</span>
                    Загрузка товаров корзины...
                </p>
            </div>
        );
    }

    if (loadStatus === DATA_LOAD_STATUS.ERROR) {
        return (
            <div className="cart-load-status">
                <p>
                    <span className="icon error">❌</span>
                    Ошибка сервера. Товары корзины не доступны.
                </p>
                <button className="reload-btn" onClick={reloadCart}>Повторить</button>
            </div>
        );
    }

    if (loadStatus === DATA_LOAD_STATUS.NOT_FOUND) {
        return (
            <div className="cart-load-status">
                <p>
                    <span className="icon empty">🛒</span>
                    Корзина пуста. Товары отсутствуют.
                </p>
            </div>
        );
    }

    const allCollapsed = cartItemRefs.current.every(el => el?.offsetHeight === 0);
    const isSearchResultEmpty = !filteredCartItemIdsSet.size && allCollapsed;

    if (isSearchResultEmpty) {
        return (
            <div className="cart-load-status">
                <p>
                    <span className="icon not-found">🔎</span>
                    Товары не найдены - ни один из них не соответствует условиям поиска.
                </p>
            </div>
        );
    }

    return (
        <ul className="cart-item-list">
            {cartItemList.map((cartItem, idx) => {
                const productId = cartItem.id;
                const product = productMap[productId];
                if (!product) return null;

                return (
                    <CartItem
                        key={productId}
                        selfRef={(el) => assignRefInArray(el, idx, cartItemRefs)}
                        cartItemRefs={cartItemRefs}
                        filteredCartItemIdsSet={filteredCartItemIdsSet}
                        searchQuery={searchQuery}
                        cartClearing={cartClearing}
                        showCartClearAnimation={showCartClearAnimation}
                        setShowCartClearAnimation={setShowCartClearAnimation}
                        cartItem={cartItem}
                        product={product}
                        customerDiscount={customerDiscount}
                        position={idx}
                        onCartItemVisibilityChange={onCartItemVisibilityChange}
                        pricesContentRef={(el) => assignRefInMap(el, productId, pricesContentRefsMap)}
                        totalsContentRef={(el) => assignRefInMap(el, productId, totalsContentRefsMap)}
                        maxPricesWidth={maxPricesWidth}
                        maxTotalsWidth={maxTotalsWidth}
                        isTouchDevice={isTouchDevice}
                        isAuthenticated={isAuthenticated}
                        addCartItemInProgress={addCartItemInProgress}
                        removeCartItemInProgress={removeCartItemInProgress}
                        checkoutInProgress={checkoutInProgress}
                    />
                );
            })}
        </ul>
    );
}

const CartItem = ({
    selfRef,
    cartItemRefs,
    filteredCartItemIdsSet,
    searchQuery,
    cartClearing,
    showCartClearAnimation,
    setShowCartClearAnimation,
    cartItem,
    product,
    customerDiscount,
    position,
    onCartItemVisibilityChange,
    pricesContentRef,
    totalsContentRef,
    maxPricesWidth,
    maxTotalsWidth,
    isTouchDevice,
    isAuthenticated,
    addCartItemInProgress,
    removeCartItemInProgress,
    checkoutInProgress
}) => {
    const [isPendingRemoval, setIsPendingRemoval] = useState(false);
    const [cartItemAnimation, setCartItemAnimation, cartItemAnimationRef] = useSyncedStateWithRef({
        active: true, // true | false
        reason: null, // 'filtering' | 'pendingRemoval' | 'restore' | 'remove' | 'clearCart' | null
        phase: 'expanding' // 'expanding' | 'collapsing' | 'transitioning' | null
    });
    const [isHiddenByFilter, setIsHiddenByFilter] = useState(false);
    const dispatch = useDispatch();

    const isCartItemShown = 
        (!cartItemAnimation.active || cartItemAnimation.phase !== 'collapsing') &&
        !isHiddenByFilter &&
        !showCartClearAnimation;
    
    const showDeletedCartItem = isCartItemShown;
    const showPendingRemovalCartItem = isPendingRemoval && isCartItemShown;
    const showCartItem = !isPendingRemoval && isCartItemShown;

    const title = formatProductTitle(product.name, product.brand);

    const resetCartItemAnimation = () => {
        setCartItemAnimation({ active: false, reason: null, phase: null });
    }

    const handleExpandEnd = () => {
        resetCartItemAnimation();
    };

    const handleCollapseEnd = () => {
        const animation = cartItemAnimationRef.current;

        switch (animation.reason) {
            case 'filtering':
                setIsHiddenByFilter(true);
                onCartItemVisibilityChange(cartItem.id, false);
                break;

            case 'pendingRemoval':
                onCartItemVisibilityChange(cartItem.id, false);
                break;
        
            case 'remove':
                dispatch(unsetCartItem(cartItem.id));
                dispatch(refreshCartTotals());
                break;
        
            case 'clearCart':
                const allCollapsed = cartItemRefs.current.every(el => el?.offsetHeight === 0);

                if (allCollapsed) {
                    dispatch(clearCart());
                    setShowCartClearAnimation(false);
                }
                break;
        
            default: // 'restore'
                break;
        }
        
        resetCartItemAnimation(); // Сброс работает для всех анимаций
    };

    // Включение видимости колонок для товара
    useEffect(() => {
        if (!showCartItem) return;
        onCartItemVisibilityChange(cartItem.id, true);
    }, [showCartItem]);

    // Установка анимации при фильтрации
    useEffect(() => {
        const isInFilteredList = filteredCartItemIdsSet.has(cartItem.id);

        const { active: animActive, reason: animReason } = cartItemAnimation;
        const isFilterAnimation = animActive && animReason === 'filtering';
        const isRemoveAnimation = animActive && ['remove', 'clearCart'].includes(animReason);

        if (isInFilteredList) {
            if (isFilterAnimation || isHiddenByFilter) {
                setIsHiddenByFilter(false);
                setCartItemAnimation({ active: true, reason: null, phase: 'expanding' });
            }
        } else {
            if (!isFilterAnimation && !isRemoveAnimation) {
                setCartItemAnimation({ active: true, reason: 'filtering', phase: 'collapsing' });
            }
        }
    }, [filteredCartItemIdsSet]);

    // Установка анимации схлопывания при очистке корзины
    useEffect(() => {
        if (!showCartClearAnimation) return;
        setCartItemAnimation({ active: true, reason: 'clearCart', phase: 'collapsing' });
    }, [showCartClearAnimation]);

    if (cartItem.deleted) {
        return (
            <li ref={selfRef} className="cart-item">
                <Collapsible
                    isExpanded={showDeletedCartItem}
                    className="cart-item-card-collapsible"
                    showContextIndicator={false}
                    onExpandEnd={handleExpandEnd}
                    onCollapseEnd={handleCollapseEnd}
                >
                    <DeletedCartItem
                        id={cartItem.id}
                        title={title}
                        searchQuery={searchQuery}
                        cartClearing={cartClearing}
                        isAnimationActive={cartItemAnimation.active}
                        setCartItemAnimation={setCartItemAnimation}
                        addCartItemInProgress={addCartItemInProgress}
                        removeCartItemInProgress={removeCartItemInProgress}
                        checkoutInProgress={checkoutInProgress}
                    />
                </Collapsible>
            </li>
        );
    }

    return (
        <li ref={selfRef} className="cart-item">
            <Collapsible
                isExpanded={showCartItem}
                className="cart-item-card-collapsible"
                showContextIndicator={false}
                onExpandEnd={handleExpandEnd}
                onCollapseEnd={handleCollapseEnd}
            >
                <CartItemCard
                    id={cartItem.id}
                    images={product.images}
                    mainImageIndex={product.mainImageIndex}
                    sku={product.sku}
                    title={title}
                    available={product.available}
                    unit={product.unit}
                    price={product.price}
                    productDiscount={product.discount}
                    customerDiscount={customerDiscount}
                    searchQuery={searchQuery}
                    quantity={cartItem.quantity}
                    quantityReduced={cartItem.quantityReduced}
                    outOfStock={cartItem.outOfStock}
                    inactive={cartItem.inactive}
                    pricesContentRef={pricesContentRef}
                    totalsContentRef={totalsContentRef}
                    maxPricesWidth={maxPricesWidth}
                    maxTotalsWidth={maxTotalsWidth}
                    cartClearing={cartClearing}
                    isTouchDevice={isTouchDevice}
                    isAuthenticated={isAuthenticated}
                    isPendingRemoval={isPendingRemoval}
                    setIsPendingRemoval={setIsPendingRemoval}
                    isAnimationActive={cartItemAnimation.active}
                    setCartItemAnimation={setCartItemAnimation}
                    addCartItemInProgress={addCartItemInProgress}
                    removeCartItemInProgress={removeCartItemInProgress}
                    checkoutInProgress={checkoutInProgress}
                />
            </Collapsible>

            <Collapsible
                isExpanded={showPendingRemovalCartItem}
                className="cart-item-card-collapsible"
                showContextIndicator={false}
                onExpandEnd={handleExpandEnd}
                onCollapseEnd={handleCollapseEnd}
            >
                <PendingRemovalCartItem
                    id={cartItem.id}
                    sku={product.sku}
                    title={title}
                    searchQuery={searchQuery}
                    quantity={cartItem.quantity}
                    position={position}
                    cartClearing={cartClearing}
                    isPendingRemoval={isPendingRemoval}
                    setIsPendingRemoval={setIsPendingRemoval}
                    isAnimationActive={cartItemAnimation.active}
                    setCartItemAnimation={setCartItemAnimation}
                    addCartItemInProgress={addCartItemInProgress}
                    removeCartItemInProgress={removeCartItemInProgress}
                    checkoutInProgress={checkoutInProgress}
                />
            </Collapsible>
        </li>
    );
}

function CartItemCard({
    pricesContentRef,
    totalsContentRef,
    maxPricesWidth,
    maxTotalsWidth,
    id,
    images,
    mainImageIndex,
    sku,
    title,
    available,
    unit,
    price,
    productDiscount,
    customerDiscount,
    searchQuery,
    quantity,
    quantityReduced,
    outOfStock,
    inactive,
    cartClearing,
    isTouchDevice,
    isAuthenticated,
    isPendingRemoval,
    setIsPendingRemoval,
    isAnimationActive,
    setCartItemAnimation,
    addCartItemInProgress,
    removeCartItemInProgress,
    checkoutInProgress
}) {
    const [upserting, setUpserting] = useState(false);
    const [removing, setRemoving] = useState(false);
    const isUnmountedRef = useRef(false);
    const dispatch = useDispatch();

    const slug = generateSlug(title);
    const productUrl = routeConfig.productDetails.generatePath({ slug, sku, productId: id });

    const hasImages = images.length > 0;
    const thumbImageSrc = hasImages
        ? (images[mainImageIndex] ?? images[0]).thumbnails.small
        : PRODUCT_IMAGE_PLACEHOLDER;
    const thumbImageAlt = hasImages ? title : '';

    const effectiveDiscount = Math.max(productDiscount, customerDiscount);
    const hasDiscount = effectiveDiscount > 0;
    const currentPrice = hasDiscount ? price * (1 - effectiveDiscount / 100) : price;
    const originalTotal = price * quantity;
    const currentTotal = currentPrice * quantity;
    const savedTotal = originalTotal - currentTotal;

    const formattedOriginalPrice = formatCurrency(price);
    const formattedCurrentPrice = formatCurrency(currentPrice)
    const formattedOriginalTotal = formatCurrency(originalTotal);
    const formattedCurrentTotal = formatCurrency(currentTotal)
    const formattedSavedTotal = formatCurrency(savedTotal);

    const isUnavailable =
        isAnimationActive ||
        removing ||
        isPendingRemoval ||
        cartClearing ||
        checkoutInProgress;
    const isCartItemUiBlocked = upserting || isUnavailable;

    const handleRemove = async () => {
        setRemoving(true);
        addCartItemInProgress(id);

        const { status, message } = await dispatch(sendCartItemRemoveRequest(id));
        if (isUnmountedRef.current) return;

        logRequestStatus({ context: 'CART: REMOVE ITEM', status, message });

        if (status !== REQUEST_STATUS.SUCCESS) {
            openAlertModal({
                type: 'error',
                dismissible: false,
                title: 'Не удалось удалить товар из корзины',
                message: 'Ошибка при удалении товара.\nПодробности ошибки в консоли.'
            });
        } else {
            setIsPendingRemoval(true);
            setCartItemAnimation({ active: true, reason: 'pendingRemoval', phase: 'transitioning' });
        }

        setRemoving(false);
        removeCartItemInProgress(id);
    };

    // Очистка при размонтировании
    useEffect(() => {
        return () => {
            isUnmountedRef.current = true;
        };
    }, []);

    return (
        <article
            data-id={id}
            className={cn('cart-item-card', {
                'unavailable': isUnavailable,
                'quantity-reduced': quantityReduced,
                'out-of-stock': outOfStock,
                'inactive': inactive
            })}
            data-message={removing ? '⏳ Удаление товара из корзины...' : ''}
        >
            <div className="product-thumb">
                <BlockableLink to={productUrl}>
                    <TrackedImage
                        className="product-thumb-img"
                        src={thumbImageSrc}
                        alt={thumbImageAlt}
                    />
                </BlockableLink>
            </div>

            <div className="product-info">
                <h4 className="product-title">
                    <BlockableLink to={productUrl}>
                        {highlightText(title, searchQuery)}
                    </BlockableLink>
                </h4>
                {sku && (
                    <p className="product-info-item">
                        <span className="label">Артикул:</span>
                        <span className="value">
                            {highlightText(sku, searchQuery)}
                        </span>
                    </p>
                )}
                {hasDiscount && (
                    <p className="product-info-item">
                        <span className="label">Применённая скидка:</span>
                        <span className="value">
                            {effectiveDiscount}%
                            {productDiscount > customerDiscount
                                ? ' (скидка на товар)'
                                : ' (клиентская скидка)'}
                        </span>
                    </p>
                )}
            </div>

            <div className="product-prices" style={{ minWidth: maxPricesWidth || 'auto' }}>
                <div ref={pricesContentRef} className="measured-content">
                    {hasDiscount && (
                        <p className="original-price">{formattedOriginalPrice} руб.</p>
                    )}
                    <p className="current-price">{formattedCurrentPrice} руб.</p>
                    <p className="unit-info">(цена за 1 {unit})</p>
                </div>
            </div>

            <div className="math-symbol multiply">×</div>

            {outOfStock ? (
                <div className="out-of-stock">
                    <p className="stock-info">
                        <span className="icon">❌</span>
                        Нет в наличии
                    </p>
                    <p className="quantity-info">
                        {'В корзине: '}
                        <span className="quantity-unit">
                            <span className="quantity">{quantity}</span>
                            {` ${unit}`}
                        </span>
                    </p>
                </div>
            ) : inactive ? (
                <div className="inactive">
                    <p className="stock-info">
                        <span className="icon">🔒</span>
                        Не продаётся
                    </p>
                    <p className="quantity-info">
                        {'В корзине: '}
                        <span className="quantity-unit">
                            <span className="quantity">{quantity}</span>
                            {` ${unit}`}
                        </span>
                    </p>
                </div>
            ) : (
                <ProductQuantitySelector
                    id={id}
                    availableQuantity={available}
                    orderedQuantity={quantity}
                    quantityReduced={quantityReduced}
                    isTouchDevice={isTouchDevice}
                    isAuthenticated={isAuthenticated}
                    uiBlocked={isCartItemUiBlocked}
                    minQuantity={1}
                    onLoading={setUpserting}
                />
            )}

            <div className="math-symbol equal">=</div>

            <div className="product-total-amounts" style={{ minWidth: maxTotalsWidth || 'auto' }}>
                <div ref={totalsContentRef} className="measured-content">
                    {hasDiscount && (
                        <p className="product-original-total">{formattedOriginalTotal} руб.</p>
                    )}
                    <p className="product-current-total">{formattedCurrentTotal} руб.</p>
                    {hasDiscount && (
                        <p className="product-saved-total">Экономия: {formattedSavedTotal} руб.</p>
                    )}
                </div>
            </div>

            <div className="remove-product-box">
                <button
                    className="remove-product-btn"
                    onClick={handleRemove}
                    disabled={isCartItemUiBlocked}
                    aria-label="Удалить товар из корзины"
                >
                    ❌
                </button>
            </div>
        </article>
    );
}

function PendingRemovalCartItem({
    id,
    sku,
    title,
    searchQuery,
    quantity,
    position,
    cartClearing,
    isPendingRemoval,
    setIsPendingRemoval,
    isAnimationActive,
    setCartItemAnimation,
    addCartItemInProgress,
    removeCartItemInProgress,
    checkoutInProgress
}) {
    const [restoring, setRestoring] = useState(false);
    const [restoreError, setRestoreError] = useState(false);
    const [isStatusTextVisible, setIsStatusTextVisible] = useState(false);
    const [secondsLeftToRemove, setSecondsLeftToRemove] = useState(10);

    const removeTimerRef = useRef(null);
    const isUnmountedRef = useRef(false);

    const dispatch = useDispatch();

    const statusText =
        restoring
            ? '⏳ Восстановление...'
            : restoreError
                ? '❌ Не удалось восстановить товар... Попробуйте снова.'
                : `⏲ Удаление через ${secondsLeftToRemove} сек.`;

    const isCartItemUiBlocked =
        !isPendingRemoval ||
        isAnimationActive ||
        restoring ||
        cartClearing ||
        checkoutInProgress;

    const clearRemoveTimer = () => {
        clearTimeout(removeTimerRef.current);
        removeTimerRef.current = null;
    };
    
    const handleRestore = async () => {
        clearRemoveTimer();
        setIsStatusTextVisible(true);
        setRestoreError(false);
        setRestoring(true);
        addCartItemInProgress(id);

        const cartItemData = { quantity, position };
        const { status, message } = await dispatch(sendCartItemRestoreRequest(id, cartItemData));
        if (isUnmountedRef.current) return;

        logRequestStatus({ context: 'CART: RESTORE ITEM', status, message });

        if (status !== REQUEST_STATUS.SUCCESS) {
            setRestoreError(true);
        } else {
            setIsStatusTextVisible(false);
            setIsPendingRemoval(false);
            setCartItemAnimation({ active: true, reason: 'restore', phase: 'transitioning' });
        }
        
        setRestoring(false);
        removeCartItemInProgress(id);
    };

    const handleRemove = () => {
        clearRemoveTimer();
        setIsStatusTextVisible(false);
        setCartItemAnimation({ active: true, reason: 'remove', phase: 'collapsing' });
    };

    // Очистка при размонтировании
    useEffect(() => {
        return () => {
            isUnmountedRef.current = true;

            if (removeTimerRef.current) {
                clearRemoveTimer();
                dispatch(unsetCartItem(id));
                dispatch(refreshCartTotals());
            }
        };
    }, []);

    // Запуск таймера автоудаления
    useEffect(() => {
        if (!isPendingRemoval || isAnimationActive) return;
    
        setSecondsLeftToRemove(10);
        setIsStatusTextVisible(true);

        const tick = () => {
            setSecondsLeftToRemove(prev => {
                const next = prev - 1;

                // Задержка перед удалением товара
                if (next <= 0) {
                    removeTimerRef.current = setTimeout(handleRemove, 500);
                    return 0;
                }

                removeTimerRef.current = setTimeout(tick, 1000);
                return next;
            });
        };
        
        removeTimerRef.current = setTimeout(tick, 1000);

        return () => clearRemoveTimer();
    }, [isPendingRemoval, isAnimationActive]);

    // Остановка таймера при анимации или очистке корзины
    useEffect(() => {
        if (!isAnimationActive && !cartClearing) return;

        clearRemoveTimer();
        setIsStatusTextVisible(false);
    }, [isAnimationActive, cartClearing]);

    return (
        <div className="cart-item-pending-removal"> 
            <div className="cart-item-info">
                <strong>{highlightText(title, searchQuery)}</strong><br />
                {sku && (
                    <>
                        <small>Артикул: {highlightText(sku, searchQuery)}</small><br />
                    </>
                )}
                <span className="cart-item-warning">
                    Товар был удалён из корзины.
                    Вы можете восстановить его или удалить окончательно.
                </span>
            </div>

            <div className="cart-item-controls-box">
                <p className={cn('cart-item-status-text', {
                    'visible': isStatusTextVisible,
                    'error': restoreError
                })}>
                    {statusText}
                </p>

                <div className="cart-item-buttons-box">
                    <button
                        className="restore-cart-item-btn"
                        onClick={handleRestore}
                        disabled={isCartItemUiBlocked}
                        aria-label="Восстановить товар в корзине"
                    >
                        Восстановить
                    </button>

                    <button
                        className="remove-cart-item-btn"
                        onClick={handleRemove}
                        disabled={isCartItemUiBlocked}
                        aria-label="Удалить товар из корзины"
                    >
                        Удалить
                    </button>
                </div>
            </div>
            
        </div>
    );
}

function DeletedCartItem({
    id,
    title,
    searchQuery,
    cartClearing,
    isAnimationActive,
    setCartItemAnimation,
    addCartItemInProgress,
    removeCartItemInProgress,
    checkoutInProgress
}) {
    const [removing, setRemoving] = useState(false);
    const [removeError, setRemoveError] = useState(false);
    const [isStatusTextVisible, setIsStatusTextVisible] = useState(true);
    const isUnmountedRef = useRef(false);
    const dispatch = useDispatch();

    const statusText =
        removing
            ? '⏳ Удаление...'
            : removeError
                ? '❌ Не удалось удалить товар... Попробуйте снова.'
                : '⚠️ Удалить эту позицию из корзины?';

    const isCartItemUiBlocked = isAnimationActive || removing || cartClearing || checkoutInProgress;

    const handleRemove = async () => {
        setIsStatusTextVisible(true);
        setRemoveError(false);
        setRemoving(true);
        addCartItemInProgress(id);

        const { status, message } = await dispatch(sendCartItemRemoveRequest(id));
        if (isUnmountedRef.current) return;

        logRequestStatus({ context: 'CART: REMOVE ITEM', status, message });

        if (status !== REQUEST_STATUS.SUCCESS) {
            setRemoveError(true);
        } else {
            setIsStatusTextVisible(false);
            setCartItemAnimation({ active: true, reason: 'remove', phase: 'collapsing' });
        }

        setRemoving(false);
        removeCartItemInProgress(id);
    };

    // Очистка при размонтировании
    useEffect(() => {
        return () => {
            isUnmountedRef.current = true;
        };
    }, []);

    return (
        <div className="cart-item-deleted">
            <div className="cart-item-info">
                <strong>{highlightText(title, searchQuery)}</strong><br />
                <span className="cart-item-warning">
                    Этот товар был удалён из магазина и больше недоступен.
                </span>
            </div>

            <div className="cart-item-controls-box">
                <p className={cn('cart-item-status-text', {
                    'visible': isStatusTextVisible,
                    'error': removeError
                })}>
                    {statusText}
                </p>

                <div className="cart-item-buttons-box">
                    <button
                        className="remove-cart-item-btn"
                        onClick={handleRemove}
                        aria-label="Удалить товар из корзины"
                        disabled={isCartItemUiBlocked}
                    >
                        Удалить
                    </button>
                </div>
            </div>
            
        </div>
    );
}
