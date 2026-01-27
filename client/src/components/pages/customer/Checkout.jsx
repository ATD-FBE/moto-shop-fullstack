import React, { useState, useRef, useLayoutEffect, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import cn from 'classnames';
import CheckoutForm from './checkout/CheckoutForm.jsx';
import CheckoutSummary from './checkout/CheckoutSummary.jsx';
import OrderDraftExpirationTimer from './checkout/OrderDraftExpirationTimer.jsx';
import { useStructureRefs } from '@/context/StructureRefsContext.js';
import {
    sendOrderDraftRequest,
    sendOrderDraftDeleteRequest
} from '@/api/checkoutRequests.js';
import {
    setIsNavigationBlocked,
    setLockedRouteCancelPath,
    freezeLockedRouteCancel,
    clearLockedRoute
} from '@/redux/slices/uiSlice.js';
import { applyCartState } from '@/services/cartService.js';
import { formatOrderAdjustmentLogs } from '@/services/checkoutService.js';
import { openConfirmModal, closeConfirmModal } from '@/services/modalConfirmService.js';
import { openAlertModal } from '@/services/modalAlertService.js';
import { formatCurrency } from '@/helpers/textHelpers.js';
import { logRequestStatus } from '@/helpers/requestLogger.js';
import { routeConfig } from '@/config/appRouting.js';
import { CLIENT_CONSTANTS, MIN_ORDER_AMOUNT } from '@shared/constants.js';

const { FORM_STATUS, BASE_SUBMIT_STATES, SUCCESS_DELAY } = CLIENT_CONSTANTS;

const getSubmitStates = (isCancelPath) => {
    const base = BASE_SUBMIT_STATES;
    const {
        DEFAULT, LOADING, LOAD_ERROR, CANCELING, CANCEL_ERROR, CANCEL_SUCCESS, FORBIDDEN,
        BAD_REQUEST, NOT_FOUND, CONFLICT, LIMITATION, MODIFIED, INVALID, ERROR, NETWORK, SUCCESS
    } = FORM_STATUS;
    const submitActionLabel = 'Оформить заказ';
    const cancelActionLabel = 'Отменить заказ';

    const submitStates = {
        ...base,
        [DEFAULT]: { submitBtnLabel: submitActionLabel, cancelBtnLabel: cancelActionLabel },
        [LOADING]: { ...base[LOADING], mainMessage: 'Загрузка заказа...' },
        [LOAD_ERROR]: { ...base[LOAD_ERROR], mainMessage: 'Не удалось загрузить заказ.' },
        [CANCELING]: { ...base[CANCELING], mainMessage: 'Выполняется отмена заказа...' },
        [CANCEL_ERROR]: {
            ...base[CANCEL_ERROR],
            mainMessage: 'Не удалось отменить заказ.',
            submitBtnLabel: submitActionLabel,
            cancelBtnLabel: cancelActionLabel
        },
        [CANCEL_SUCCESS]: {
            ...base[CANCEL_SUCCESS],
            mainMessage: 'Заказ отменён!',
            addMessage: isCancelPath
                ? 'Вы будете перенаправлены на выбранную страницу.'
                : 'Вы будете перенаправлены на страницу корзины товаров.',
            cancelBtnLabel: 'Перенаправление...'
        },
        [FORBIDDEN]: {
            ...base[FORBIDDEN],
            submitBtnLabel: submitActionLabel,
            cancelBtnLabel: cancelActionLabel
        },
        [BAD_REQUEST]: {
            ...base[BAD_REQUEST],
            submitBtnLabel: submitActionLabel,
            cancelBtnLabel: cancelActionLabel
        },
        [NOT_FOUND]: {
            ...base[NOT_FOUND],
            mainMessage: 'Исходный заказ или связанный с ним ресурс не найден.',
            addMessage: 'Оформление невозможно.',
        },
        [CONFLICT]: {
            ...base[CONFLICT],
            mainMessage: 'Состав корзины и черновика заказа не совпадают.',
            addMessage: 'Заказ отменён.'
        },
        [LIMITATION]: {
            ...base[LIMITATION],
            mainMessage: 'Сумма заказа меньше минимальной.',
            addMessage: 'Заказ отменён.'
        },
        [MODIFIED]: {
            ...base[MODIFIED],
            mainMessage: 'Данные заказа изменились.',
            addMessage: 'Проверьте обновлённые позиции и подтвердите заказ снова.',
            submitBtnLabel: submitActionLabel,
            cancelBtnLabel: cancelActionLabel
        },
        [INVALID]: {
            ...base[INVALID],
            submitBtnLabel: submitActionLabel,
            cancelBtnLabel: cancelActionLabel
        },
        [ERROR]: {
            ...base[ERROR],
            submitBtnLabel: submitActionLabel,
            cancelBtnLabel: cancelActionLabel
        },
        [NETWORK]: {
            ...base[NETWORK],
            submitBtnLabel: submitActionLabel,
            cancelBtnLabel: cancelActionLabel
        },
        [SUCCESS]: {
            ...base[SUCCESS],
            mainMessage: 'Заказ успешно оформлен!',
            addMessage: 'Вы будете перенаправлены на страницу заказов.',
            submitBtnLabel: 'Перенаправление...'
        }
    };

    const lockedStatuses = Object.entries(submitStates)
        .map(([status, state]) => state.locked && status)
        .filter(Boolean);

    return { submitStates, lockedStatuses: new Set(lockedStatuses) };
};

export default function Checkout() {
    const user = useSelector(state => state.auth.user);
    const { dashboardPanelActive, lockedRoute } = useSelector(state => state.ui);
    const productMap = useSelector(state => state.products.byId);

    const [frozenSubmitStates, setFrozenSubmitStates] = useState(() => getSubmitStates(false));
    const { submitStates, lockedStatuses } = frozenSubmitStates;

    const [submitStatus, setSubmitStatus] = useState(FORM_STATUS.LOADING);
    const [orderDraft, setOrderDraft] = useState(null);

    const checkoutSidebarRef = useRef(null);
    const isUnmountedRef = useRef(false);
    const { mainHeaderRef } = useStructureRefs();

    const dispatch = useDispatch();
    const location = useLocation();
    const navigate = useNavigate();

    const { orderId } = useParams();

    const cartPath = routeConfig.customerCart.paths[0];
    const cancelPath = lockedRoute?.cancelPath ?? null;

    const topStickyOffset = 
        (mainHeaderRef.current?.offsetHeight ?? 0) +
        (dashboardPanelActive ? 0 : checkoutSidebarRef.current?.offsetHeight ?? 0) +
        6; // Дополнительный отступ сверху

    const loadOrderDraft = async (orderId) => {
        setSubmitStatus(FORM_STATUS.LOADING);

        const responseData = await dispatch(sendOrderDraftRequest(orderId));
        if (isUnmountedRef.current) return;

        const {
            status, message, purchaseProductList, cartItemList,
            customerDiscount, orderAdjustments, orderDraft
        } = responseData;
        logRequestStatus({ context: 'CHECKOUT: LOAD DRAFT', status, message });

        const hasAdjustments = orderAdjustments?.length > 0;
        const adjustmentsMsg = hasAdjustments
            ? '<span className="bold underline">Изменения товаров в заказе:</span>\n\n' +
                formatOrderAdjustmentLogs(orderAdjustments, productMap)
            : '';
            
        if (hasAdjustments) {
            dispatch(applyCartState(purchaseProductList, cartItemList, customerDiscount));
        }

        if (status !== FORM_STATUS.SUCCESS) {
            const finalStatus = lockedStatuses.has(status) ? status : FORM_STATUS.LOAD_ERROR;

            if (finalStatus === status) dispatch(clearLockedRoute()); // Закрытый статус

            if (finalStatus === FORM_STATUS.CONFLICT) { // Товары в корзине и заказе не совпадают
                const conflictMsg =
                    'Товары в корзине и черновике заказа не совпадают.\n' +
                    '<span className="color-red">Заказ отменён!</span> ' +
                    'Вы будете перенаправлены на страницу корзины.';

                openAlertModal({
                    openDelay: 1000,
                    type: 'error',
                    dismissible: false,
                    title: 'Произошла рассинхронизация',
                    message: conflictMsg,
                    dismissBtnLabel: 'Перейти в корзину',
                    onClose: () => {
                        dispatch(clearLockedRoute());
                        navigate(cartPath);
                    }
                });
            } else if (finalStatus === FORM_STATUS.LIMITATION) { // Сумма заказа меньше минимальной
                const amountToAdd = Math.max(0, MIN_ORDER_AMOUNT - orderDraft.totals.totalAmount);
                const minOrderAmountMsg =
                    'Сумма заказа после синхронизации с текущими данными каталога ' +
                    'стала меньше минимальной.\n' +
                    '<span className="color-red">Заказ отменён!</span> ' +
                    'Вы будете перенаправлены на страницу корзины.\n\n' +
                    'Минимальная сумма заказа — ' +
                    `<span className="color-blue">${formatCurrency(MIN_ORDER_AMOUNT)}</span> ₽. ` +
                    'Добавьте товаров ещё на ' +
                    `<span className="color-green">${formatCurrency(amountToAdd)}</span> ₽.`;

                openAlertModal({
                    openDelay: 1000,
                    type: 'error',
                    dismissible: false,
                    title: 'Сумма заказа меньше минимальной',
                    message: minOrderAmountMsg + (hasAdjustments ? `\n\n\n${adjustmentsMsg}` : ''),
                    dismissBtnLabel: 'Перейти в корзину',
                    onClose: () => {
                        dispatch(clearLockedRoute());
                        navigate(cartPath);
                    }
                });
            }

            return setSubmitStatus(finalStatus);
        }

        // Успешный ответ
        setOrderDraft(orderDraft);
        setSubmitStatus(FORM_STATUS.DEFAULT);

        if (hasAdjustments) {
            openAlertModal({
                openDelay: 1000,
                type: 'warning',
                dismissible: false,
                title: 'Заказ был синхронизирован с текущими данными каталога',
                message: adjustmentsMsg
            });
        }
    };

    const reloadOrderDraft = () => loadOrderDraft(orderId);

    const cancelOrderDraft = async (orderId) => {
        setSubmitStatus(FORM_STATUS.CANCELING);

        const { status, message } = await dispatch(sendOrderDraftDeleteRequest(orderId));
        if (isUnmountedRef.current) return;
    
        logRequestStatus({ context: 'CHECKOUT: CANCEL', status, message });
    
        if (![FORM_STATUS.SUCCESS, FORM_STATUS.NOT_FOUND].includes(status)) {
            const finalStatus = lockedStatuses.has(status) ? status : FORM_STATUS.CANCEL_ERROR;

            if (finalStatus === status) dispatch(clearLockedRoute()); // Закрытый статус
            setSubmitStatus(finalStatus);
            throw new Error(message);
        }
    
        dispatch(freezeLockedRouteCancel()); // Запрет новой установки пути для отмены
        setSubmitStatus(FORM_STATUS.CANCEL_SUCCESS);
    };

    const redirectOnCancelSuccess = (cancelPath = null) => {
        setTimeout(() => {
            if (isUnmountedRef.current) return;

            dispatch(clearLockedRoute());
            navigate(cancelPath ?? cartPath)
        }, SUCCESS_DELAY);
    };

    const cancelOrderDraftAndRedirect = async () => {
        try {
            await cancelOrderDraft(orderId); // Статус запроса не SUCCESS => редирект не выполнится
            redirectOnCancelSuccess();
        } catch {}
    };

    const handleDraftExpiration = () => {
        closeConfirmModal();
        cancelOrderDraftAndRedirect();
    };

    // Блокирование ссылок при первой загрузке страницы
    useLayoutEffect(() => {
        if (lockedRoute && location.pathname === lockedRoute.path) {
            dispatch(setIsNavigationBlocked(true));
        }
    }, [lockedRoute, location.pathname, dispatch]);

    // Стартовая загрузка заказа и очистка при размонтировании
    useEffect(() => {
        loadOrderDraft(orderId);

        return () => {
            isUnmountedRef.current = true;
        };
    }, [orderId]);

    // Обновление конфигов состояния формы
    useEffect(() => {
        if (submitStatus === FORM_STATUS.CANCEL_SUCCESS) return; // Заморозка состояний формы при отмене
        setFrozenSubmitStates(getSubmitStates(!!cancelPath));
    }, [submitStatus, !!cancelPath]);

    // Попытка ухода со страницы
    useEffect(() => {
        if (!cancelPath) return; // Целевой путь отсутствует => выход
        if (lockedStatuses.has(submitStatus)) return; // Закрытый статус => выход

        // Показ модального окна подтверждения (с запросом на отмену заказа)
        openConfirmModal({
            dismissible: false,
            prompt: 'Вы точно хотите покинуть страницу оформления заказа?',
            confirmBtnLabel: 'Отменить заказ',
            cancelBtnLabel: 'Остаться',
            onConfirm: () => cancelOrderDraft(orderId),
            onFinalize: () => redirectOnCancelSuccess(cancelPath),
            onCancel: () => dispatch(setLockedRouteCancelPath(null))
        });
    }, [cancelPath, submitStatus, orderId, openConfirmModal, dispatch]);

    return (
        <div className="checkout-page">
            <header className="checkout-header">
                <h2>Оформление заказа</h2>
                <p>Просмотр сайта недоступен, пока заказ не будет оформлен или отменён.</p>
                <p>Товары в корзине резервируются на ограниченное время для оформления заказа.</p>
            </header>

            <div className="checkout-main">
                <CheckoutForm
                    registrationEmail={user.email}
                    productMap={productMap}
                    topStickyOffset={topStickyOffset}
                    cartPath={cartPath}
                    orderId={orderId}
                    orderDraft={orderDraft}
                    submitStates={submitStates}
                    lockedStatuses={lockedStatuses}
                    submitStatus={submitStatus}
                    setSubmitStatus={setSubmitStatus}
                    setOrderDraft={setOrderDraft}
                    reloadOrderDraft={reloadOrderDraft}
                />

                <aside
                    ref={checkoutSidebarRef}
                    className={cn(
                        'checkout-sidebar',
                        { 'dashboard-panel-active': dashboardPanelActive }
                    )}
                >
                    <CheckoutSummary
                        orderTotals={orderDraft?.totals ?? null}
                    />

                    <div className="checkout-order-draft-panel">
                        <OrderDraftExpirationTimer
                            expirationTime={orderDraft?.expiresAt ?? null}
                            isCancelled={submitStatus === FORM_STATUS.CANCEL_SUCCESS}
                            onExpire={handleDraftExpiration}
                        />

                        <button
                            className="cancel-order-btn"
                            onClick={cancelOrderDraftAndRedirect}
                            disabled={lockedStatuses.has(submitStatus)}
                        >
                            {submitStates[submitStatus]?.cancelBtnLabel ?? ''}
                        </button>
                    </div>
                </aside>
            </div>
        </div>
    );
};
