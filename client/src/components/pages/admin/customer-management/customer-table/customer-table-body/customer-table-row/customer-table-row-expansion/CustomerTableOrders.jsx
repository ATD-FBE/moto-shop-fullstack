import React, { useState, useRef, useEffect } from 'react';
import { useDispatch } from 'react-redux';
import cn from 'classnames';
import {
    OrderCardOverview,
    OrderCardInfoGrid,
    OrderCardStatusSummary,
    OrderRefreshButton
} from '@/components/parts/OrderParts.jsx';
import { sendCustomerOrderListRequest } from '@/api/customerRequests.js';
import { pluralize } from '@/helpers/textHelpers.js';
import { logRequestStatus } from '@/helpers/requestLogger.js';
import { getLastFinancialsEventEntry } from '@shared/commonHelpers.js';
import {
    CUSTOMER_TABLE_ORDERS_LOAD_STEP,
    ORDER_STATUS,
    ORDER_ACTIVE_STATUSES,
    CLIENT_CONSTANTS
} from '@shared/constants.js';

const { LOAD_STATUS_MIN_HEIGHT, DATA_LOAD_STATUS, REQUEST_STATUS } = CLIENT_CONSTANTS;

export default function CustomerTableOrders({ customerId, customerName, isExpanded }) {
    const [lastUsedLimit, setLastUsedLimit] = useState(CUSTOMER_TABLE_ORDERS_LOAD_STEP);
    
    const [initOrdersReady, setinitOrdersReady] = useState(false);
    const [totalOrders, setTotalOrders] = useState(0);
    const [loadedOrderList, setLoadedOrderList] = useState([]);
    const [ordersLoading, setOrdersLoading] = useState(false);
    const [ordersLoadError, setOrdersLoadError] = useState(false);

    const isUnmountedRef = useRef(false);

    const dispatch = useDispatch();

    const ordersLoadStatus =
        ordersLoading
            ? DATA_LOAD_STATUS.LOADING
            : ordersLoadError
                ? DATA_LOAD_STATUS.ERROR
                : !loadedOrderList.length
                    ? DATA_LOAD_STATUS.NOT_FOUND
                    : DATA_LOAD_STATUS.READY;

    const isOrderUiBlocked = ordersLoading || ordersLoadError;

    const loadOrders = async (limit) => {
        setLastUsedLimit(limit);
        setOrdersLoadError(false);
        setOrdersLoading(true);

        const lastLoadedOrder = loadedOrderList[0];
        const params = new URLSearchParams({
            ...(lastLoadedOrder ? { firstOrderId: loadedOrderList[0].id } : {}),
            skip: loadedOrderList.length,
            limit
        });
        const urlParams = params.toString();

        const responseData = await dispatch(sendCustomerOrderListRequest(customerId, urlParams));
        if (isUnmountedRef.current) return;

        const {
            status, message, totalCustomerOrders, customerOrderList, needFullReload
        } = responseData;
        logRequestStatus({ context: 'CUSTOMER: LOAD ORDER LIST', status, message });

        if (status !== REQUEST_STATUS.SUCCESS) {
            setOrdersLoadError(true);
        } else {
            setTotalOrders(totalCustomerOrders);
            setLoadedOrderList(
                prev => needFullReload
                    ? customerOrderList               // Полная замена списка заказов
                    : [...prev, ...customerOrderList] // Дополнение списка заказов
            );
            setinitOrdersReady(true);
        }
        
        setOrdersLoading(false);
    };

    const refreshOrderState = (orderId, refreshedOrder) => {
        setLoadedOrderList(prev => prev.map(order => order.id === orderId ? refreshedOrder : order));
    };

    // Очистка при размонтировании
    useEffect(() => {
        return () => {
            isUnmountedRef.current = true;
        };
    }, []);

    useEffect(() => {
        if (isExpanded && !initOrdersReady && !ordersLoading && !ordersLoadError) {
            loadOrders(CUSTOMER_TABLE_ORDERS_LOAD_STEP);
        }
    }, [isExpanded, initOrdersReady, ordersLoading, ordersLoadError]);

    return (
        <div className="customer-table-orders">
            <header className="customer-table-orders-header">
                <h3>Заказы клиента {customerName}:</h3>
            </header>

            <CustomerTableOrdersMain
                loadStatus={ordersLoadStatus}
                reloadOrders={() => loadOrders(lastUsedLimit)}
                totalOrders={totalOrders}
                loadedOrderList={loadedOrderList}
                loadOrders={loadOrders}
                uiBlocked={isOrderUiBlocked}
                refreshOrderState={refreshOrderState}
            />
        </div>
    );
}

function CustomerTableOrdersMain({
    loadStatus,
    reloadOrders,
    totalOrders,
    loadedOrderList,
    loadOrders,
    uiBlocked,
    refreshOrderState
}) {
    return (
        <div className="customer-table-orders-main">
            <ul className="order-list">
                {loadedOrderList.map(order => (
                    <li key={order.id} className="order-item">
                        <OrderCard
                            order={order}
                            uiBlocked={uiBlocked}
                            refreshOrderState={refreshOrderState}
                        />
                    </li>
                ))}
            </ul>

            <OrdersLoadStatus
                loadStatus={loadStatus}
                reloadOrders={reloadOrders}
                totalOrders={totalOrders}
                loadedOrdersCount={loadedOrderList.length}
            />

            <OrdersLoadControls
                totalOrders={totalOrders}
                loadedOrdersCount={loadedOrderList.length}
                loadOrders={loadOrders}
                uiBlocked={uiBlocked}
            />
        </div>
    );
}

function OrdersLoadStatus({ loadStatus, reloadOrders, totalOrders, loadedOrdersCount }) {
    if (loadStatus === DATA_LOAD_STATUS.LOADING) {
        return (
            <div
                className="orders-load-status"
                style={{ height: LOAD_STATUS_MIN_HEIGHT }}
            >
                <p>
                    <span className="icon load">⏳</span>
                    Загрузка заказов...
                </p>
            </div>
        );
    }

    if (loadStatus === DATA_LOAD_STATUS.ERROR) {
        return (
            <div
                className="orders-load-status"
                style={{ height: LOAD_STATUS_MIN_HEIGHT }}
            >
                <p>
                    <span className="icon error">❌</span>
                    Ошибка сервера. Заказы не доступны.
                </p>
                <button className="reload-btn" onClick={reloadOrders}>Повторить</button>
            </div>
        );
    }

    if (loadStatus === DATA_LOAD_STATUS.NOT_FOUND) {
        return (
            <div
                className="orders-load-status"
                style={{ height: LOAD_STATUS_MIN_HEIGHT }}
            >
                <p>
                    <span className="icon not-found">🔎</span>
                    Заказы не найдены.
                </p>
            </div>
        );
    }

    if (loadStatus === DATA_LOAD_STATUS.READY && loadedOrdersCount !== totalOrders) {
        return <p className="orders-load-more-indicator">...</p>;
    }

    return null;
}

function OrdersLoadControls({ totalOrders, loadedOrdersCount, loadOrders, uiBlocked }) {
    if (loadedOrdersCount === 0 || loadedOrdersCount === totalOrders) return null;

    const ORDERS_LOAD_ALL_LIMIT = 0;
    const restOrdersCount = totalOrders - loadedOrdersCount;
    const isRestGreaterThanStep = restOrdersCount > CUSTOMER_TABLE_ORDERS_LOAD_STEP;
    const ordersLoadMoreLimit = isRestGreaterThanStep
        ? CUSTOMER_TABLE_ORDERS_LOAD_STEP
        : ORDERS_LOAD_ALL_LIMIT;

    const ordersLoadMoreBtnLabel = isRestGreaterThanStep
        ? pluralize(CUSTOMER_TABLE_ORDERS_LOAD_STEP, [
            `Следующий ${CUSTOMER_TABLE_ORDERS_LOAD_STEP} заказ`,
            `Следующие ${CUSTOMER_TABLE_ORDERS_LOAD_STEP} заказа`,
            `Следующие ${CUSTOMER_TABLE_ORDERS_LOAD_STEP} заказов`
        ])
        : pluralize(restOrdersCount, [
            `Оставшийся ${restOrdersCount} заказ`,
            `Оставшиеся ${restOrdersCount} заказа`,
            `Оставшиеся ${restOrdersCount} заказов`
        ]);

    return (
        <div className="orders-load-controls">
            <button
                className="orders-load-more-btn"
                onClick={() => loadOrders(ordersLoadMoreLimit)}
                disabled={uiBlocked}
            >
                <span className="icon">➕</span>
                {ordersLoadMoreBtnLabel}
            </button>

            {isRestGreaterThanStep && (
                <button
                    className="orders-load-all-btn"
                    onClick={() => loadOrders(ORDERS_LOAD_ALL_LIMIT)}
                    disabled={uiBlocked}
                >
                    <span className="icon">📑</span>
                    Все заказы
                </button>
            )}
        </div>
    );
}

function OrderCard({ order, uiBlocked, refreshOrderState }) {
    const {
        id, orderNumber, statusHistory: orderStatusHistory, confirmedAt,
        lastActivityAt, totals, totalItems, delivery, financials
    } = order;

    const currentOrderStatusEntry = orderStatusHistory.at(-1);

    const isActiveOrder = ORDER_ACTIVE_STATUSES.includes(currentOrderStatusEntry.status);
    const isCompletedOrder = currentOrderStatusEntry.status === ORDER_STATUS.COMPLETED;
    const isCancelledOrder = currentOrderStatusEntry.status === ORDER_STATUS.CANCELLED;

    return (
        <article data-id={id} className={cn(
            'order-card',
            { 'completed': isCompletedOrder },
            { 'cancelled': isCancelledOrder }
        )}>
            {isActiveOrder && <span className="active-order-badge">⚡</span>}

            <OrderCardOverview
                id={id}
                orderNumber={orderNumber}
                confirmedAt={confirmedAt}
                totalOrderItems={totalItems}
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
            />

            <div className="order-meta mobile-stack">
                <OrderCardStatusSummary
                    lastActivityAt={lastActivityAt}
                    orderStatus={currentOrderStatusEntry.status}
                    financialsState={financials.state}
                    lastFinancialsEventEntry={getLastFinancialsEventEntry(financials.eventHistory)}
                />

                {isActiveOrder && (
                    <div className="order-actions">
                        <OrderRefreshButton
                            orderId={id}
                            viewMode="list"
                            uiBlocked={uiBlocked}
                            refreshOrderState={refreshOrderState}
                        />
                    </div>
                )}
            </div>
        </article>
    );
}
