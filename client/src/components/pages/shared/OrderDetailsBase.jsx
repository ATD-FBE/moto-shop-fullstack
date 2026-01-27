import React, { useState, useRef, useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { useLocation, useParams, useNavigate, Link } from 'react-router-dom';
import cn from 'classnames';
import { OrderInvoiceButton } from '@/components/parts/OrderParts.jsx';
import OrderDetailsItems from './order-details-base/OrderDetailsItems.jsx';
import { subscribeToOrderUpdates } from '@/components/sse/SseOrderManagement.jsx';
import { sendOrderRequest } from '@/api/orderRequests.js';
import { routeConfig } from '@/config/appRouting.js';
import { parseRouteParams } from '@/helpers/routeHelpers.js';
import { logRequestStatus } from '@/helpers/requestLogger.js';
import { formatCurrency } from '@/helpers/textHelpers.js';
import {
    buildCustomerFullName,
    buildShippingAddressDisplay,
    getShippingCostDisplay
} from '@/services/orderService.js';
import {
    applyDotNotationPatches,
    getLastFinancialsEventEntry,
    isEqualCurrency
} from '@shared/commonHelpers.js';
import {
    DATA_LOAD_STATUS,
    REQUEST_STATUS,
    DELIVERY_METHOD_OPTIONS,
    PAYMENT_METHOD,
    PAYMENT_METHOD_OPTIONS,
    TRANSACTION_TYPE,
    ONLINE_TRANSACTION_STATUS,
    ORDER_STATUS,
    ORDER_STATUS_CONFIG,
    ORDER_ACTIVE_STATUSES,
    ORDER_FINAL_STATUSES,
    FINANCIALS_STATE_CONFIG,
    FINANCIALS_EVENT_CONFIG,
    CLIENT_CONSTANTS
} from '@shared/constants.js';

const { NO_VALUE_LABEL } = CLIENT_CONSTANTS;

export default function OrderDetailsBase({
    routeKey = '',
    subscribeToUpdates = false,
    renderHeaderContent,
    renderManagementControls,
    renderSectionEditButton,
    renderSectionFormCollapsible,
    renderManagementNotes,
    renderCardOnlinePaymentLink,
    renderOrderRefreshButton,
    renderOrderRepeatButton
}) {
    const [orderLoading, setOrderLoading] = useState(true);
    const [orderLoadError, setOrderLoadError] = useState(false);
    const [order, setOrder] = useState(null);

    const isUnmountedRef = useRef(false);

    const dispatch = useDispatch();
    const location = useLocation();
    const params = useParams();
    const navigate = useNavigate();

    const { orderNumber, orderId } = parseRouteParams({ routeKey, params, routeConfig });

    const orderLoadStatus =
        orderLoading
            ? DATA_LOAD_STATUS.LOADING
            : orderLoadError
                ? DATA_LOAD_STATUS.ERROR
                : DATA_LOAD_STATUS.READY;

    const loadOrder = async () => {
        setOrderLoadError(false);
        setOrderLoading(true);

        const params = new URLSearchParams({ viewMode: 'page' }); // page | list
        const urlParams = params.toString();
        const { status, message, order } = await dispatch(sendOrderRequest(orderId, urlParams));
        if (isUnmountedRef.current) return;

        logRequestStatus({ context: 'ORDER: LOAD SINGLE', status, message });

        if (status !== REQUEST_STATUS.SUCCESS) {
            setOrderLoadError(true);
        } else {
            setOrder(order);

            const { id, orderNumber } = order;
            const updatedUrl = routeConfig[routeKey].generatePath({ orderNumber, orderId: id });

            if (location.pathname !== updatedUrl) {
                navigate(updatedUrl, { replace: true });
            }
        }

        setOrderLoading(false);
    };

    const updateOrderState = (updatedOrderId, updatedOrderData = {}) => {
        if (updatedOrderId !== orderId) return
        
        const {
            orderPatches = [],
            newOrderStatusEntry,
            newFinancialsEventEntry,
            voidedFinancialsEventEntry,
            newAuditLogEntry
        } = updatedOrderData;

        if (
            !orderPatches.length &&
            !newOrderStatusEntry &&
            !newFinancialsEventEntry &&
            !voidedFinancialsEventEntry &&
            !newAuditLogEntry
        ) return;

        setOrder(prev => {
            // Обновление полей через дот-нотацию
            const updatedOrder = { ...prev, items: prev.items.map(item => ({ ...item })) };
            applyDotNotationPatches(updatedOrder, orderPatches);
    
            // Добавление/замена новых записей в массивы историй
            if (newOrderStatusEntry) {
                updatedOrder.statusHistory = [
                    ...(updatedOrder.statusHistory || []),
                    newOrderStatusEntry
                ];
            }
            if (newFinancialsEventEntry) {
                updatedOrder.financials = {
                    ...(updatedOrder.financials || {}),
                    eventHistory: [
                        ...(updatedOrder.financials?.eventHistory || []),
                        newFinancialsEventEntry
                    ]
                };
            }
            if (voidedFinancialsEventEntry) {
                updatedOrder.financials = {
                    ...(updatedOrder.financials || {}),
                    eventHistory: (updatedOrder.financials?.eventHistory || []).map(entry => {
                        if (entry.eventId === voidedFinancialsEventEntry.eventId) {
                            return voidedFinancialsEventEntry;
                        }
                        return entry;
                    })
                };
            }
            if (newAuditLogEntry) {
                updatedOrder.auditLog = [
                    ...(updatedOrder.auditLog || []),
                    newAuditLogEntry
                ];
            }
    
            return updatedOrder;
        });
    };
    
    const refreshOrderState = (_, refreshedOrder) => setOrder(refreshedOrder);

    // Стартовая загрузка заказа и очистка при размонтировании
    useEffect(() => {
        loadOrder();

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
    
    return (
        <div className="order-details-page">
            <header className="order-details-header">
                {renderHeaderContent?.(orderNumber)}
            </header>

            <OrdersDetailsLoadStatus
                loadStatus={orderLoadStatus}
                reloadOrderDetails={loadOrder}
            />

            <OrderDetailsMain
                order={order}
                renderManagementControls={renderManagementControls}
                renderSectionEditButton={renderSectionEditButton}
                renderSectionFormCollapsible={renderSectionFormCollapsible}
                renderManagementNotes={renderManagementNotes}
                renderCardOnlinePaymentLink={renderCardOnlinePaymentLink}
                renderOrderRefreshButton={renderOrderRefreshButton}
                renderOrderRepeatButton={renderOrderRepeatButton}
                refreshOrderState={refreshOrderState}
            />
        </div>
    );
};

function OrdersDetailsLoadStatus({ loadStatus, reloadOrderDetails }) {
    if (loadStatus === DATA_LOAD_STATUS.LOADING) {
        return (
            <div className="order-details-load-status">
                <p>
                    <span className="icon load">⏳</span>
                    Загрузка заказов...
                </p>
            </div>
        );
    }

    if (loadStatus === DATA_LOAD_STATUS.ERROR) {
        return (
            <div className="order-details-load-status">
                <p>
                    <span className="icon error">❌</span>
                    Ошибка сервера. Детали заказа не доступны.
                </p>
                <button className="reload-btn" onClick={reloadOrderDetails}>Повторить</button>
            </div>
        );
    }

    return null;
}

function OrderDetailsMain({
    order,
    renderManagementControls,
    renderSectionEditButton,
    renderSectionFormCollapsible,
    renderManagementNotes,
    renderCardOnlinePaymentLink,
    renderOrderRefreshButton,
    renderOrderRepeatButton,
    refreshOrderState
}) {
    if (!order) return;

    const [expandedSectionForms, setExpandedSectionForms] = useState(new Set());
    const [isItemsSubmitting, setIsItemsSubmitting] = useState(false);
    const [itemsSubmitResult, setItemsSubmitResult] = useState(null);
    const [itemsResponseResult, setItemsResponseResult] = useState(null);

    const {
        id, orderNumber, confirmedAt, statusHistory: orderStatusHistory,
        totals, items: orderItemList, customerInfo, delivery, financials,
        customerComment, internalNote, auditLog
    } = order;

    const { subtotalAmount, totalSavings, totalAmount } = totals;
    const {
        firstName, lastName, middleName, email, phone,
        customerId, login, registrationEmail
    } = customerInfo;
    const { deliveryMethod, allowCourierExtra, shippingAddress, shippingCost } = delivery;
    const {
        defaultPaymentMethod,
        state: financialsState,
        totalPaid,
        totalRefunded,
        eventHistory: financialsEventHistory
    } = financials;

    const confirmedDate = new Date(confirmedAt)?.toLocaleString();

    const currentOrderStatusEntry = orderStatusHistory.at(-1);
    const lastFinancialsEventEntry = getLastFinancialsEventEntry(financialsEventHistory);

    const isActiveOrder = ORDER_ACTIVE_STATUSES.includes(currentOrderStatusEntry.status);
    const isFinalOrder = ORDER_FINAL_STATUSES.includes(currentOrderStatusEntry.status);
    const isConfirmedOrder = currentOrderStatusEntry.status === ORDER_STATUS.CONFIRMED;
    const isCompletedOrder = currentOrderStatusEntry.status === ORDER_STATUS.COMPLETED;
    const isCancelledOrder = currentOrderStatusEntry.status === ORDER_STATUS.CANCELLED;

    const currentOrderStatusConfig = ORDER_STATUS_CONFIG[currentOrderStatusEntry.status];
    const financialsStateConfig = FINANCIALS_STATE_CONFIG[financialsState];
    const lastFinancialsEventConfig = FINANCIALS_EVENT_CONFIG[lastFinancialsEventEntry?.event];

    const currentOrderStatusChangedDate =
        new Date(currentOrderStatusEntry.changedAt)?.toLocaleString();
    const lastFinancialsEventChangedDate =
        new Date(lastFinancialsEventEntry?.changedAt)?.toLocaleString();

    const netPaid = totalPaid - totalRefunded;
    const paymentBalance = netPaid - totalAmount;
    const isUnpaid = !isEqualCurrency(paymentBalance, 0) && paymentBalance < 0;

    const currentOnlineTransaction = financials.currentOnlineTransaction;

    const showCardOnlinePaymentLink =
        renderCardOnlinePaymentLink &&
        defaultPaymentMethod === PAYMENT_METHOD.CARD_ONLINE &&
        isActiveOrder &&
        isUnpaid &&
        !currentOnlineTransaction;

    const onlineOperationType =
        currentOnlineTransaction?.type === TRANSACTION_TYPE.PAYMENT
            ? 'Онлайн-оплата'
            : currentOnlineTransaction?.type === TRANSACTION_TYPE.REFUND
                ? 'Возврат средств'
                : NO_VALUE_LABEL;

    const onlineOperationStatus =
        currentOnlineTransaction?.status === ONLINE_TRANSACTION_STATUS.INIT
            ? 'Подготовка'
            : currentOnlineTransaction?.status === ONLINE_TRANSACTION_STATUS.PROCESSING
                ? 'В обработке'
                : NO_VALUE_LABEL;

    const formattedTotalPaid = formatCurrency(totalPaid);
    const formattedTotalAmount = formatCurrency(totalAmount);
    const formattedTotalRefunded = formatCurrency(totalRefunded);
    const formattedPaymentBalance = formatCurrency(paymentBalance);
    const formattedSubtotalAmount = formatCurrency(subtotalAmount);
    const formattedTotalSavings = formatCurrency(totalSavings);
    const formattedTotalAmountSummary = formatCurrency(totalAmount + (shippingCost ?? 0));
    const formattedOnlineTransactionAmount = formatCurrency(currentOnlineTransaction?.amount);

    const packingStatusDisplay =
        ORDER_STATUS_CONFIG[currentOrderStatusEntry.status]?.packingLabel ?? '';
    const paymentMethodDisplay =
        PAYMENT_METHOD_OPTIONS.find(opt => opt.value === defaultPaymentMethod)?.label ?? '';
    const deliveryMethodDisplay =
        DELIVERY_METHOD_OPTIONS.find(opt => opt.value === deliveryMethod)?.label ?? '';

    const customerFullName = buildCustomerFullName(firstName, lastName, middleName);
    const shippingAddressDisplay = buildShippingAddressDisplay(deliveryMethod, shippingAddress);
    const shippingCostDisplay = getShippingCostDisplay(shippingCost);

    const cancellationReason = orderStatusHistory.find(
        entry => entry.status === ORDER_STATUS.CANCELLED
    )?.cancellationReason;

    const toggleSectionFormExpansion = (section) => {
        setExpandedSectionForms(prev => {
            const newExpandedSet = new Set(prev);

            if (newExpandedSet.has(section)) {
                newExpandedSet.delete(section);
            } else {
                newExpandedSet.add(section);
            }

            return newExpandedSet;
        });
    };

    return (
        <article data-id={id} className="order-details-main">
            <div className={cn('order-details-sections', {
                'completed': isCompletedOrder,
                'cancelled': isCancelledOrder
            })}>
                {isActiveOrder && <span className="active-order-badge">⚡</span>}

                {renderManagementControls && (
                    <section data-section="management" className="order-details-section">
                        <header className="order-details-section-header">
                            <h3>Управление заказом</h3>
                        </header>

                        {renderManagementControls({
                            isActiveOrder,
                            orderId: id,
                            currentOrderStatusEntry,
                            orderStatusHistory,
                            deliveryMethod,
                            allowCourierExtra,
                            shippingCost,
                            defaultPaymentMethod,
                            financialsState,
                            financialsEventHistory,
                            netPaid,
                            totalAmount,
                            internalNote,
                            auditLog
                        })}
                    </section>
                )}

                <section data-section="order" className="order-details-section">
                    <header className="order-details-section-header">
                        <h3>Информация о заказе</h3>
                    </header>

                    <div className="order-details-section-main">
                        <p>
                            <span className="label">Номер заказа: </span>
                            <span className="value">{orderNumber}</span>
                        </p>
                        <p>
                            <span className="label">Заказ оформлен: </span>
                            <span className="value">{confirmedDate}</span>
                        </p>
                        <p>
                            <span className="label">Товарных позиций: </span>
                            <span className="value">{orderItemList.length}</span>
                        </p>
                        <p>
                            <span className="label">Состояние груза: </span>
                            <span className="value">{packingStatusDisplay}</span>
                        </p>
                        <p>
                            <span className="label">Текущий статус: </span>
                            <span className="value">
                                {currentOrderStatusConfig?.label ?? NO_VALUE_LABEL}
                            </span>
                        </p>
                        <p>
                            <span className="label">Статус изменён: </span>
                            <span className="value">{currentOrderStatusChangedDate}</span>
                        </p>
                        {isActiveOrder && renderOrderRefreshButton && (
                            <p>
                                {renderOrderRefreshButton({
                                    orderId: id,
                                    viewMode: 'page',
                                    refreshOrderState
                                })}
                            </p>
                        )}
                        {isFinalOrder && renderOrderRepeatButton && (
                            <p>
                                {renderOrderRepeatButton({ orderId: id })}
                            </p>
                        )}
                    </div>
                </section>

                <section data-section="payment" className="order-details-section">
                    <header className="order-details-section-header">
                        <h3>Информация об оплате</h3>

                        {isConfirmedOrder && renderSectionEditButton?.({
                            section: 'paymentSection',
                            isFormExpanded: expandedSectionForms.has('paymentSection'),
                            toggleSectionFormExpansion
                        })}
                    </header>

                    {isConfirmedOrder && renderSectionFormCollapsible?.({
                        isExpanded: expandedSectionForms.has('paymentSection'),
                        section: 'paymentSection',
                        order
                    })}

                    <div className="order-details-section-main">
                        <p>
                            <span className="label">Способ оплаты: </span>
                            <span className="value">{paymentMethodDisplay}</span>
                        </p>
                        <p>
                            <span className="label">Сумма к оплате: </span>
                            <span className="value">{formattedTotalAmount} руб.</span>
                        </p>
                        <p>
                            <span className="label">Всего оплачено: </span>
                            <span className="value">{formattedTotalPaid} руб.</span>
                        </p>
                        {totalRefunded > 0 && (
                            <p>
                                <span className="label">Всего возвращено: </span>
                                <span className="value">{formattedTotalRefunded} руб.</span>
                            </p>
                        )}
                        {!isCancelledOrder && (
                            <p>
                                <span className="label">Разница по оплате (баланс): </span>
                                <span className="value">{formattedPaymentBalance} руб.</span>
                            </p>
                        )}
                        <p>
                            <span className="label">Скачать счёт: </span>
                            <OrderInvoiceButton orderId={id} />
                        </p>
                        <p>
                            <span className="label">Текущее состояние: </span>
                            <span className="value">
                                {financialsStateConfig?.label ?? NO_VALUE_LABEL}
                            </span>
                        </p>
                        {lastFinancialsEventEntry && (
                            <>
                                <p>
                                    <span className="label">Последнее финансовое событие: </span>
                                    <span className="value">
                                        {lastFinancialsEventConfig?.label ?? NO_VALUE_LABEL}
                                        {' на сумму '}
                                        {formatCurrency(lastFinancialsEventEntry.action.amount)}
                                        {' руб.'}
                                    </span>
                                </p>
                                <p>
                                    <span className="label">Событие зафиксировано: </span>
                                    <span className="value">{lastFinancialsEventChangedDate}</span>
                                </p>
                            </>
                        )}
                        {showCardOnlinePaymentLink && (
                            <p>
                                <span className="label">Оплата банковской картой: </span>
                                {renderCardOnlinePaymentLink({ orderNumber, orderId: id })}
                            </p>
                        )}
                        {currentOnlineTransaction && (
                            <div className="order-online-transaction">
                                <span className="label">Информация о текущей онлайн-транзакции: </span>
                                <ul className="value">
                                    <li>Тип операции: {onlineOperationType}</li>
                                    <li>Провайдер: {currentOnlineTransaction.providers?.join(', ')}</li>
                                    <li>Сумма: {formattedOnlineTransactionAmount} руб.</li>
                                    <li>Статус: {onlineOperationStatus}</li>
                                    {currentOnlineTransaction.confirmationUrl && (
                                        <li>
                                            Ссылка подтверждения операции:{' '}
                                            <a
                                                href={currentOnlineTransaction.confirmationUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                            >
                                                {currentOnlineTransaction.confirmationUrl} ↗
                                            </a>
                                        </li>
                                    )}
                                </ul>
                            </div>
                        )}
                    </div>
                </section>

                <section data-section="customer-info" className="order-details-section">
                    <header className="order-details-section-header">
                        <h3>Сведения о покупателе</h3>

                        {isConfirmedOrder && renderSectionEditButton?.({
                            section: 'customerInfoSection',
                            isFormExpanded: expandedSectionForms.has('customerInfoSection'),
                            toggleSectionFormExpansion
                        })}
                    </header>

                    {isConfirmedOrder && renderSectionFormCollapsible?.({
                        isExpanded: expandedSectionForms.has('customerInfoSection'),
                        section: 'customerInfoSection',
                        order
                    })}

                    <div className="order-details-section-main">
                        {customerId && (
                            <p>
                                <span className="label">ID клиента: </span>
                                <span className="value">{customerId}</span>
                            </p>
                        )}
                        <p>
                            <span className="label">ФИО: </span>
                            <span className="value">{customerFullName}</span>
                        </p>
                        <p>
                            <span className="label">Логин: </span>
                            <span className="value">{login}</span>
                        </p>
                        <p>
                            <span className="label">
                                {`Email${
                                    registrationEmail !== email
                                        ? ' (заказ)'
                                        : ' (совпадает с указанным при регистрации)'
                                }: `}
                            </span>
                            <span className="value">{email}</span>
                        </p>
                        {registrationEmail !== email && (
                            <p>
                                <span className="label">Email (регистрация): </span>
                                <span className="value">{registrationEmail}</span>
                            </p>
                        )}
                        <p>
                            <span className="label">Телефон: </span>
                            <span className="value">{phone}</span>
                        </p>
                        {customerComment && (
                            <p>
                                <span className="label">Комментарий к заказу: </span>
                                <span className="value">"{customerComment}"</span>
                            </p>
                        )}
                    </div>
                </section>

                <section data-section="delivery" className="order-details-section">
                    <header className="order-details-section-header">
                        <h3>Информация о доставке</h3>

                        {isConfirmedOrder && renderSectionEditButton?.({
                            section: 'deliverySection',
                            isFormExpanded: expandedSectionForms.has('deliverySection'),
                            toggleSectionFormExpansion
                        })}
                    </header>

                    {isConfirmedOrder && renderSectionFormCollapsible?.({
                        isExpanded: expandedSectionForms.has('deliverySection'),
                        section: 'deliverySection',
                        order
                    })}

                    <div className="order-details-section-main">
                        <p>
                            <span className="label">Метод доставки: </span>
                            <span className="value">
                                {deliveryMethodDisplay}{allowCourierExtra && ' (экстра)'}
                            </span>
                        </p>
                        <p>
                            <span className="label">Адрес: </span>
                            <span className="value">{shippingAddressDisplay}</span>
                        </p>
                        <p>
                            <span className="label">Стоимость доставки: </span>
                            <span className="value">{shippingCostDisplay}</span>
                        </p>
                    </div>
                </section>

                <section data-section="items" className="order-details-section">
                    <header className="order-details-section-header">
                        <h3>Содержимое заказа</h3>

                        {isConfirmedOrder && renderSectionEditButton?.({
                            section: 'itemsSection',
                            isFormExpanded: expandedSectionForms.has('itemsSection'),
                            toggleSectionFormExpansion
                        })}
                    </header>

                    {isConfirmedOrder && renderSectionFormCollapsible?.({
                        isExpanded: expandedSectionForms.has('itemsSection'),
                        section: 'itemsSection',
                        order,
                        itemsSubmitResult,
                        setIsItemsSubmitting,
                        onItemsResponseResult: (data) => setItemsResponseResult(data)
                    })}

                    <OrderDetailsItems
                        isEditMode={expandedSectionForms.has('itemsSection')}
                        orderId={id}
                        orderItemList={orderItemList}
                        isItemsSubmitting={isItemsSubmitting}
                        itemsResponseResult={itemsResponseResult}
                        onItemsSubmitResult={(data) => setItemsSubmitResult(data)}
                        clearItemsSubmitResult={() => setItemsSubmitResult(null)}
                        clearItemsResponseResult={() => setItemsResponseResult(null)}
                    />

                    <div className="order-details-items-summary">
                        <p className="total-order-items">
                            <span className="label-col">Количество позиций:</span>
                            <span className="value-col">{orderItemList.length}</span>
                        </p>
                        <p className="subtotal-amount">
                            <span className="label-col">Сумма заказа без скидки:</span>
                            <span className="value-col">{formattedSubtotalAmount} руб.</span>
                        </p>
                        <p className="total-savings">
                            <span className="label-col">Общая скидка:</span>
                            <span className="value-col">-{formattedTotalSavings} руб.</span>
                        </p>
                        <p className="total-amount">
                            <span className="label-col">Сумма заказа со скидкой:</span>
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
                </section>
            </div>

            {renderManagementNotes?.({
                customerComment,
                internalNote,
                cancellationReason,
                floating: true
            })}
        </article>
    );
}
