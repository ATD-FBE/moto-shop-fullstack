import React, { useState, useRef, useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { useLocation, useNavigate } from 'react-router-dom';
import cn from 'classnames';
import { OrderCardOverview, OrderCardInfoGrid } from '@/components/parts/OrderParts.jsx';
import Collapsible from '@/components/common/Collapsible.jsx';
import Toolbar from '@/components/common/Toolbar.jsx';
import TrackedImage from '@/components/common/TrackedImage.jsx';
import { subscribeToOrderUpdates } from '@/components/sse/SseOrderManagement.jsx';
import { sendOrderListRequest } from '@/api/orderRequests.js';
import {
    getInitSortParam,
    getInitPageParam,
    getInitLimitParam,
    getInitFilterParams
} from '@/helpers/initParamsHelper.js';
import { formatCurrency, formatProductTitle } from '@/helpers/textHelpers.js';
import { logRequestStatus } from '@/helpers/requestLogger.js';
import {
    buildCustomerFullName,
    buildShippingAddressDisplay,
    getShippingCostDisplay
} from '@/services/orderService.js';
import { ordersFilterOptions } from '@shared/filterOptions.js';
import { ordersSortOptions } from '@shared/sortOptions.js';
import { ordersPageLimitOptions } from '@shared/pageLimitOptions.js';
import {
    trimSetByFilter,
    applyDotNotationPatches,
    getLastFinancialsEventEntry
} from '@shared/commonHelpers.js';
import {
    ORDER_STATUS,
    ORDER_ACTIVE_STATUSES,
    ORDER_FINAL_STATUSES,
    CLIENT_CONSTANTS
} from '@shared/constants.js';

const {
    LOAD_STATUS_MIN_HEIGHT,
    DATA_LOAD_STATUS,
    REQUEST_STATUS,
    PRODUCT_IMAGE_PLACEHOLDER
} = CLIENT_CONSTANTS;
 
export default function OrdersBase({
    headerContent,
    showSort = true,
    subscribeToUpdates = false,
    isMetaMobileStacked = false,
    renderManagementControls,
    renderManagementNotes,
    renderNewManagedActiveOrdersAlert,
    renderCardOnlinePaymentLink,
    renderStatusSummary,
    renderOrderRefreshButton,
    renderOrderRepeatButton
}) {
    const [initialized, setInitialized] = useState(false);

    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState(new URLSearchParams());
    const [sort, setSort] = useState(ordersSortOptions[0].dbField);
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(ordersPageLimitOptions[0]);

    const [initOrdersReady, setInitOrdersReady] = useState(false);
    const [ordersLoading, setOrdersLoading] = useState(true);
    const [ordersLoadError, setOrdersLoadError] = useState(false);
    const [orderRepeatLoading, setOrderRepeatLoading] = useState(false); // Один повтор заказа за раз
    const [filteredOrderIds, setFilteredOrderIds] = useState(new Set());
    const [paginatedOrderList, setPaginatedOrderList] = useState([]);
    const [expandedOrderIds, setExpandedOrderIds] = useState(new Set());

    const isUnmountedRef = useRef(false);

    const dispatch = useDispatch();
    const location = useLocation();
    const navigate = useNavigate();

    const ordersLoadStatus =
        ordersLoading
            ? DATA_LOAD_STATUS.LOADING
            : ordersLoadError
                ? DATA_LOAD_STATUS.ERROR
                : !filteredOrderIds.size
                    ? DATA_LOAD_STATUS.NOT_FOUND
                    : DATA_LOAD_STATUS.READY;

    const isOrderUiBlocked = ordersLoading || ordersLoadError || orderRepeatLoading;

    const toolbarTopActiveControls = ['limit', 'search', 'filter', 'pages'];
    if (showSort) toolbarTopActiveControls.splice(1, 0, 'sort');

    const loadOrders = async (urlParams) => {
        setOrdersLoadError(false);
        setOrdersLoading(true);

        const responseData = await dispatch(sendOrderListRequest(urlParams));
        if (isUnmountedRef.current) return;

        const { status, message, filteredOrderIdList, paginatedOrderList } = responseData;
        logRequestStatus({ context: 'ORDER: LOAD LIST', status, message });

        if (status !== REQUEST_STATUS.SUCCESS) {
            setOrdersLoadError(true);
        } else {
            setFilteredOrderIds(new Set(filteredOrderIdList));
            setPaginatedOrderList(paginatedOrderList);
            setInitOrdersReady(true);
        }
        
        setOrdersLoading(false);
    };

    const reloadOrders = async () => {
        const urlParams = location.search.slice(1);
        await loadOrders(urlParams);
    };

    const toggleOrderExpansion = (id) => {
        setExpandedOrderIds(prev => {
            const newExpandedSet = new Set(prev);

            if (newExpandedSet.has(id)) {
                newExpandedSet.delete(id);
            } else {
                newExpandedSet.add(id);
            }

            return newExpandedSet;
        });
    };
    
    const updateOrderState = (orderId, updatedOrderData = {}) => {
        const {
            orderPatches = [],
            newOrderStatusEntry,
            newFinancialsEventEntry,
            lastFinancialsEventEntry
        } = updatedOrderData;

        if (
            !orderPatches.length &&
            !newOrderStatusEntry &&
            !newFinancialsEventEntry &&
            !lastFinancialsEventEntry
        ) return;

        setPaginatedOrderList(prev => prev.map(order => {
            if (order.id !== orderId) return order;
    
            // Обновление полей через дот-нотацию
            const updatedOrder = { ...order, items: order.items.map(item => ({ ...item })) };
            applyDotNotationPatches(updatedOrder, orderPatches);
    
            // Замена последних (и единственных) записей в массивах историй
            if (newOrderStatusEntry) {
                updatedOrder.statusHistory = [newOrderStatusEntry];
            }
            if (newFinancialsEventEntry) {
                updatedOrder.financials = {
                    ...(updatedOrder.financials || {}),
                    eventHistory: [newFinancialsEventEntry]
                };
            }
            if (lastFinancialsEventEntry !== undefined) {
                updatedOrder.financials = {
                    ...(updatedOrder.financials || {}),
                    eventHistory: lastFinancialsEventEntry === null ? [] : [lastFinancialsEventEntry]
                };
            }
    
            return updatedOrder;
        }));
    };

    const refreshOrderState = (orderId, refreshedOrder) => {
        setPaginatedOrderList(prev => prev.map(order => order.id === orderId ? refreshedOrder : order));
    };

    // Очистка при размонтировании
    useEffect(() => {
        return () => {
            isUnmountedRef.current = true;
        };
    }, []);

    // Подписка на обновление данных заказа для админа
    useEffect(() => {
        if (!subscribeToUpdates) return;

        const unsubscribe = subscribeToOrderUpdates((orderUpdate) => {
            updateOrderState(orderUpdate.orderId, orderUpdate.updatedOrderData);
        });
        return unsubscribe;
    }, []);

    // Установка начальных значений параметров компонента и очистка при размонтировании
    useEffect(() => {
        const params = new URLSearchParams(location.search);

        setSearch(params.get('search') || '');
        setFilter(getInitFilterParams(params, ordersFilterOptions));
        if (showSort) setSort(getInitSortParam(params, ordersSortOptions));
        setPage(getInitPageParam(params));
        setLimit(getInitLimitParam(params, ordersPageLimitOptions));
        
        setInitialized(true);
    }, [showSort]);

    // Запрос на загрузку заказов с заданными параметрами
    useEffect(() => {
        if (!initialized) return;

        const params = new URLSearchParams({ search, ...(showSort && { sort }), page, limit });
        filter.forEach((value, key) => params.append(key, value));

        const urlParams = params.toString();

        if (location.search !== `?${urlParams}`) {
            const newUrl = `${location.pathname}?${urlParams}`;
            navigate(newUrl, { replace: true });
        }
        
        loadOrders(urlParams);
    }, [initialized, showSort, search, filter, sort, page, limit]);

    // Удаление отсутствующих в загруженной выборке заказов из раскрытых ранее
    useEffect(() => {
        const [trimmedExpanded, expandedChanged] = trimSetByFilter(expandedOrderIds, filteredOrderIds);
        if (expandedChanged) setExpandedOrderIds(trimmedExpanded);
    }, [filteredOrderIds]);

    if (!initialized) return null;

    return (
        <div className="orders-page">
            <header className="orders-header">
                {headerContent}
            </header>

            <Toolbar
                position="top"
                activeControls={toolbarTopActiveControls}
                uiBlocked={isOrderUiBlocked}
                initDataReady={initOrdersReady}
                search={search}
                setSearch={setSearch}
                searchPlaceholder="По номеру заказа"
                filter={filter}
                setFilter={setFilter}
                filterOptions={ordersFilterOptions}
                sort={sort}
                setSort={setSort}
                sortOptions={ordersSortOptions}
                page={page}
                setPage={setPage}
                limit={limit}
                setLimit={setLimit}
                limitOptions={ordersPageLimitOptions}
                totalItems={filteredOrderIds.size}
            />

            <OrdersMain
                loadStatus={ordersLoadStatus}
                reloadOrders={reloadOrders}
                paginatedOrderList={paginatedOrderList}
                expandedOrderIds={expandedOrderIds}
                toggleOrderExpansion={toggleOrderExpansion}
                uiBlocked={isOrderUiBlocked}
                setOrderRepeatLoading={setOrderRepeatLoading}
                isMetaMobileStacked={isMetaMobileStacked}
                refreshOrderState={refreshOrderState}
                renderManagementControls={renderManagementControls}
                renderManagementNotes={renderManagementNotes}
                renderCardOnlinePaymentLink={renderCardOnlinePaymentLink}
                renderStatusSummary={renderStatusSummary}
                renderOrderRefreshButton={renderOrderRefreshButton}
                renderOrderRepeatButton={renderOrderRepeatButton}
            />

            <Toolbar
                position="bottom"
                activeControls={['info', 'pages']}
                loadStatus={ordersLoadStatus}
                uiBlocked={isOrderUiBlocked}
                initDataReady={initOrdersReady}
                page={page}
                setPage={setPage}
                limit={limit}
                totalItems={filteredOrderIds.size}
                label="Заказы"
            />

            {renderNewManagedActiveOrdersAlert?.({
                search,
                setSearch,
                filter,
                setFilter,
                page,
                setPage,
                limit,
                totalFilteredOrders: filteredOrderIds.size,
                reloadOrders
            })}
        </div>
    );
};

function OrdersMain({
    loadStatus,
    reloadOrders,
    paginatedOrderList,
    expandedOrderIds,
    toggleOrderExpansion,
    uiBlocked,
    setOrderRepeatLoading,
    isMetaMobileStacked,
    refreshOrderState,
    renderManagementControls,
    renderManagementNotes,
    renderCardOnlinePaymentLink,
    renderStatusSummary,
    renderOrderRefreshButton,
    renderOrderRepeatButton
}) {
    const [listMainHeight, setListMainHeight] = useState(LOAD_STATUS_MIN_HEIGHT);
    const listMainRef = useRef(null);

    useEffect(() => {
        if (listMainRef.current) {
            const newHeight = listMainRef.current.offsetHeight;
            if (newHeight !== listMainHeight) setListMainHeight(newHeight);
        }
    }, [loadStatus]);

    if (loadStatus === DATA_LOAD_STATUS.LOADING) {
        return (
            <div
                className="orders-main"
                style={{ height: Math.max(LOAD_STATUS_MIN_HEIGHT, listMainHeight) }}
            >
                <div className="orders-load-status">
                    <p>
                        <span className="icon load">⏳</span>
                        Загрузка заказов...
                    </p>
                </div>
            </div>
        );
    }

    if (loadStatus === DATA_LOAD_STATUS.ERROR) {
        return (
            <div
                ref={listMainRef}
                className="orders-main"
                style={{ height: LOAD_STATUS_MIN_HEIGHT }}
            >
                <div className="orders-load-status">
                    <p>
                        <span className="icon error">❌</span>
                        Ошибка сервера. Заказы не доступны.
                    </p>
                    <button className="reload-btn" onClick={reloadOrders}>Повторить</button>
                </div>
            </div>
        );
    }

    if (loadStatus === DATA_LOAD_STATUS.NOT_FOUND) {
        return (
            <div
                ref={listMainRef}
                className="orders-main"
                style={{ height: LOAD_STATUS_MIN_HEIGHT }}
            >
                <div className="orders-load-status">
                    <p>
                        <span className="icon not-found">🔎</span>
                        Заказы не найдены.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div ref={listMainRef} className="orders-main">
            <ul className="order-list">
                {paginatedOrderList.map(order => (
                    <li key={order.id} className="order-item">
                        <OrderCard
                            order={order}
                            uiBlocked={uiBlocked}
                            isExpanded={expandedOrderIds.has(order.id)}
                            toggleOrderExpansion={toggleOrderExpansion}
                            setOrderRepeatLoading={setOrderRepeatLoading}
                            isMetaMobileStacked={isMetaMobileStacked}
                            refreshOrderState={refreshOrderState}
                            renderManagementControls={renderManagementControls}
                            renderManagementNotes={renderManagementNotes}
                            renderCardOnlinePaymentLink={renderCardOnlinePaymentLink}
                            renderStatusSummary={renderStatusSummary}
                            renderOrderRefreshButton={renderOrderRefreshButton}
                            renderOrderRepeatButton={renderOrderRepeatButton}
                        />
                    </li>
                ))}
            </ul>
        </div>
    );
}

function OrderCard({
    order,
    uiBlocked,
    isMetaMobileStacked,
    isExpanded,
    toggleOrderExpansion,
    setOrderRepeatLoading,
    refreshOrderState,
    renderManagementControls,
    renderManagementNotes,
    renderCardOnlinePaymentLink,
    renderStatusSummary,
    renderOrderRefreshButton,
    renderOrderRepeatButton
}) {
    const {
        id, orderNumber, confirmedAt, lastActivityAt, statusHistory: orderStatusHistory,
        totals, items: orderItemList, customerInfo, delivery, financials,
        customerComment, internalNote
    } = order;

    const currentOrderStatusEntry = orderStatusHistory.at(-1);

    const isActiveOrder = ORDER_ACTIVE_STATUSES.includes(currentOrderStatusEntry.status);
    const isFinalOrder = ORDER_FINAL_STATUSES.includes(currentOrderStatusEntry.status);
    const isCompletedOrder = currentOrderStatusEntry.status === ORDER_STATUS.COMPLETED;
    const isCancelledOrder = currentOrderStatusEntry.status === ORDER_STATUS.CANCELLED;

    const netPaid = financials.totalPaid - financials.totalRefunded;

    const cancellationReason = orderStatusHistory.find(
        entry => entry.status === ORDER_STATUS.CANCELLED
    )?.cancellationReason;

    return (
        <article data-id={id} className={cn('order-card', {
            'completed': isCompletedOrder,
            'cancelled': isCancelledOrder
        })}>
            {isActiveOrder && <span className="active-order-badge">⚡</span>}

            <OrderCardOverview
                id={id}
                orderNumber={orderNumber}
                confirmedAt={confirmedAt}
                totalOrderItems={orderItemList.length}
                totalAmount={totals.totalAmount}
            />

            <OrderCardInfoGrid
                id={id}
                orderNumber={orderNumber}
                confirmedAt={confirmedAt}
                totalAmount={totals.totalAmount}
                totalPaid={financials.totalPaid}
                totalRefunded={financials.totalRefunded}
                orderStatus={currentOrderStatusEntry.status}
                defaultPaymentMethod={financials.defaultPaymentMethod}
                deliveryMethod={delivery.deliveryMethod}
                allowCourierExtra={delivery.allowCourierExtra}
                currentOnlineTransaction={financials.currentOnlineTransaction}
                renderCardOnlinePaymentLink={renderCardOnlinePaymentLink}
            />

            {renderManagementControls?.({
                isActiveOrder,
                orderId: id,
                currentOrderStatusEntry,
                orderStatusHistory,
                deliveryMethod: delivery.deliveryMethod,
                allowCourierExtra: delivery.allowCourierExtra,
                shippingCost: delivery.shippingCost,
                defaultPaymentMethod: financials.defaultPaymentMethod,
                financialsState: financials.state,
                financialsEventHistory: financials.eventHistory,
                netPaid,
                totalAmount: totals.totalAmount
            })}

            <div className={cn('order-meta', { 'mobile-stack': isMetaMobileStacked })}>
                {renderStatusSummary?.({
                    lastActivityAt,
                    orderStatus: currentOrderStatusEntry.status,
                    financialsState: financials.state,
                    lastFinancialsEventEntry: getLastFinancialsEventEntry(financials.eventHistory)
                })}

                {renderManagementNotes?.({
                    customerComment,
                    internalNote,
                    cancellationReason
                })}

                <div className="order-actions">
                    {isActiveOrder && renderOrderRefreshButton?.({
                        orderId: id,
                        viewMode: 'list',
                        uiBlocked,
                        refreshOrderState
                    })}

                    {isFinalOrder && renderOrderRepeatButton?.({
                        orderId: id,
                        uiBlocked,
                        onLoading: setOrderRepeatLoading
                    })}

                    <button
                        className={cn('order-details-inline-btn', { 'enabled': isExpanded })}
                        onClick={() => toggleOrderExpansion(id)}
                    >
                        <span className="icon">{isExpanded ? '🔼' : '📄'}</span>
                        {isExpanded ? 'Скрыть детали' : 'Показать детали'}
                    </button>
                </div>
            </div>

            <Collapsible isExpanded={isExpanded} className="order-details-inline-collapsible">
                <OrderDetailsInline
                    orderItemList={orderItemList}
                    customerInfo={customerInfo}
                    delivery={delivery}
                    totalAmount={totals.totalAmount}
                />
            </Collapsible>
        </article>
    );
}

function OrderDetailsInline({
    orderItemList,
    customerInfo,
    delivery,
    totalAmount
}) {
    const { firstName, lastName, middleName, email, phone } = customerInfo;
    const { deliveryMethod, shippingAddress, shippingCost } = delivery;

    const customerFullName = buildCustomerFullName(firstName, lastName, middleName);
    const shippingAddressDisplay = buildShippingAddressDisplay(deliveryMethod, shippingAddress);
    const shippingCostDisplay = getShippingCostDisplay(shippingCost);

    const formattedTotalAmount = formatCurrency(totalAmount);
    const formattedTotalAmountSummary = formatCurrency(totalAmount + (shippingCost ?? 0));

    return (
        <div className="order-details-inline">
            <div className="customer-info">
                <header className="customer-info-header">
                    <h3>Сведения о покупателе и доставке</h3>
                </header>

                <div className="customer-info-summary">
                    <p className="full-name">
                        <span className="label-col">ФИО покупателя:</span>
                        <span className="value-col">{customerFullName}</span>
                    </p>
                    <p className="email">
                        <span className="label-col">Email:</span>
                        <span className="value-col">{email}</span>
                    </p>
                    <p className="phone">
                        <span className="label-col">Телефон:</span>
                        <span className="value-col">{phone}</span>
                    </p>
                    <p className="shipping-address">
                        <span className="label-col">Адрес доставки:</span>
                        <span className="value-col">{shippingAddressDisplay}</span>
                    </p>
                </div>
            </div>

            <div className="order-details-inline-items">
                <header className="order-details-inline-items-header">
                    <h3>Содержимое заказа</h3>
                </header>

                <div role="table" className="entity-table order-details-inline-items-table">
                    <div role="rowgroup" className="table-header">
                        <div role="row">
                            <div role="columnheader" className="row-cell thumb">Фото</div>
                            <div role="columnheader" className="row-cell sku">Артикул</div>
                            <div role="columnheader" className="row-cell title">Наименование</div>
                            <div role="columnheader" className="row-cell price">Цена</div>
                            <div role="columnheader" className="row-cell discount">Скидка</div>
                            <div role="columnheader" className="row-cell quantity">Количество</div>
                            <div role="columnheader" className="row-cell total-price">Сумма</div>
                        </div>
                    </div>

                    <div role="rowgroup" className="table-body">
                        {orderItemList.map(({
                            productId,
                            image,
                            sku,
                            name,
                            brand,
                            finalUnitPrice,
                            appliedDiscount,
                            quantity,
                            unit,
                            totalPrice
                        }) => {
                            const title = formatProductTitle(name, brand);

                            const thumbImageSrc = image ?? PRODUCT_IMAGE_PLACEHOLDER;
                            const thumbImageAlt = image ? title : '';

                            const formattedPrice = formatCurrency(finalUnitPrice);
                            const formattedTotalPrice = formatCurrency(totalPrice);

                            return (
                                <div key={productId} data-id={productId} className="table-row">
                                    <div role="row" className="table-row-main">
                                        <div role="cell" className="row-cell thumb">
                                            <div className="cell-label">Фото:</div>
                                            <div className="cell-content">
                                                <div className="product-thumb">
                                                    <TrackedImage
                                                        className="product-thumb-img"
                                                        src={thumbImageSrc}
                                                        alt={thumbImageAlt}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                        <div role="cell" className="row-cell sku">
                                            <div className="cell-label">Артикул:</div>
                                            <div className="cell-content">{sku}</div>
                                        </div>
                                        <div role="cell" className="row-cell title">
                                            <div className="cell-label">Наименование:</div>
                                            <div className="cell-content">{title}</div>
                                        </div>
                                        <div role="cell" className="row-cell price">
                                            <div className="cell-label">Цена:</div>
                                            <div className="cell-content">{formattedPrice} руб.</div>
                                        </div>
                                        <div role="cell" className="row-cell discount">
                                            <div className="cell-label">Скидка:</div>
                                            <div className="cell-content">{appliedDiscount}%</div>
                                        </div>
                                        <div role="cell" className="row-cell quantity">
                                            <div className="cell-label">Количество:</div>
                                            <div className="cell-content">{quantity} {unit}</div>
                                        </div>
                                        <div role="cell" className="row-cell total-price">
                                            <div className="cell-label">Сумма:</div>
                                            <div className="cell-content">
                                                {formattedTotalPrice} руб.
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                <div className="order-details-inline-items-summary">
                    <p className="total-order-items">
                        <span className="label-col">Количество позиций:</span>
                        <span className="value-col">{orderItemList.length}</span>
                    </p>
                    <p className="total-amount">
                        <span className="label-col">Сумма заказа:</span>
                        <span className="value-col">{formattedTotalAmount} руб.</span>
                    </p>
                    <p className="shipping-cost">
                        <span className="label-col">Стоимость доставки:</span>
                        <span className="value-col">{shippingCostDisplay}</span>
                    </p>
                    <p className="total-amount-summary">
                        <span className="label-col">Итого:</span>
                        <span className="value-col">{formattedTotalAmountSummary} руб.</span>
                    </p>
                </div>
            </div>
        </div>
    );
}
