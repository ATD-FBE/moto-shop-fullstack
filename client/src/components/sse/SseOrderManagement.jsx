import { useRef, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useLocation } from 'react-router-dom';
import { sendAuthSessionRequest } from '@/api/authRequests.js';
import { login, adjustManagedActiveOrdersCount } from '@/redux/slices/authSlice.js';
import { adjustNewManagedActiveOrdersCount } from '@/redux/slices/uiSlice.js';
import { saveUserToLocalStorage } from '@/services/authService.js';
import { prepareGuestCartPayload } from '@/services/guestCartService.js';
import { routeConfig } from '@/config/appRouting.js';
import { getSseUrl } from '@/helpers/sseHelpers.js';
import { logRequestStatus } from '@/helpers/requestLogger.js';
import { REQUEST_STATUS } from '@shared/constants.js';

const LOG_CTX = 'SSE: ORDER MANAGEMENT';

// Подписка внутренних страниц на обновление со своим обработчиком
const orderUpdateSubscribers = new Set();

export const subscribeToOrderUpdates = (fn) => {
    orderUpdateSubscribers.add(fn);
    return () => orderUpdateSubscribers.delete(fn);
};

export const notifyOrderUpdate = (orderUpdate) => {
    orderUpdateSubscribers.forEach(fn => fn(orderUpdate));
};

// SSE компонент
export default function SseOrderManagement() {
    const managedActiveOrdersCount = useSelector(state =>
        state.auth.user?.managedActiveOrdersCount ?? 0
    );

    const location = useLocation();
    const dispatch = useDispatch();

    const locationPathRef = useRef(location.pathname);
    const managedActiveOrdersCountRef = useRef(managedActiveOrdersCount);
    const wasSseErrorRef = useRef(false);

    const syncAfterReconnect = async () => {
        const guestCart = prepareGuestCartPayload();
        const responseData = await dispatch(sendAuthSessionRequest(guestCart));
        const { status, message, user: updatedUser, accessTokenExp, refreshTokenExp } = responseData;

        logRequestStatus({ context: LOG_CTX, status, message });
    
        if (status === REQUEST_STATUS.SUCCESS) {
            saveUserToLocalStorage(updatedUser);
            dispatch(login({ user: updatedUser, accessTokenExp, refreshTokenExp }));

            if (
                routeConfig.adminOrders.paths.includes(locationPathRef.current) &&
                updatedUser.managedActiveOrdersCount !== managedActiveOrdersCountRef.current
            ) {
                dispatch(adjustNewManagedActiveOrdersCount(
                    updatedUser.managedActiveOrdersCount - managedActiveOrdersCountRef.current
                ));
            }
        }
    };

    const adjustAndSyncManagedActiveOrdersCount = (count) => (dispatch, getState) => {
        dispatch(adjustManagedActiveOrdersCount(count)); // Обновляет user в сторе auth
        saveUserToLocalStorage(getState().auth.user); // Сохраняет обновлённого user локально
    };

    const applySseMessage = (data) => {
        const { newManagedActiveOrdersCount, orderUpdate } = data;

        if (newManagedActiveOrdersCount) {
            // Обновление счётчика активных заказов
            dispatch(adjustAndSyncManagedActiveOrdersCount(newManagedActiveOrdersCount));

            // Обновление счётчика новых заказов для страницы списка всех заказов админа
            if (
                newManagedActiveOrdersCount > 0 &&
                routeConfig.adminOrders.paths.includes(locationPathRef.current)
            ) {
                dispatch(adjustNewManagedActiveOrdersCount(newManagedActiveOrdersCount));
            }
        }

        // Применение апдейта заказа для страниц, на которых была подписка на него
        if (orderUpdate) {
            notifyOrderUpdate(orderUpdate);
        }
    };

    // Запуск SSE (один раз)
    useEffect(() => {
        const eventSource = new EventSource(getSseUrl('order-management'), { withCredentials: true });

        eventSource.onopen = async () => {
            logRequestStatus({
                context: LOG_CTX,
                status: REQUEST_STATUS.SUCCESS,
                message: 'SSE-соединение для управления заказами открыто'
            });

            // Синхронизация данных сессии после переподключения SSE
            if (wasSseErrorRef.current) {
                syncAfterReconnect();
                wasSseErrorRef.current = false;
            }
        };

        eventSource.onmessage = (event) => {
            let data = null;
            try { data = JSON.parse(event.data); } catch { return; } // Для битых данных и мусора
            applySseMessage(data);
        };

        eventSource.onerror = () => {
            logRequestStatus({
                context: LOG_CTX,
                status: REQUEST_STATUS.ERROR,
                message: 'Ошибка соединения SSE для управления заказами'
            });
            wasSseErrorRef.current = true;
        };

        return () => {
            logRequestStatus({
                context: LOG_CTX,
                status: REQUEST_STATUS.SUCCESS,
                message: 'SSE-соединение для управления заказами закрыто'
            });
            eventSource.close();
        };
    }, []);

    // Обновление маршрута
    useEffect(() => {
        locationPathRef.current = location.pathname;
    }, [location.pathname]);

    // Обновление количества активных заказов
    useEffect(() => {
        managedActiveOrdersCountRef.current = managedActiveOrdersCount;
    }, [managedActiveOrdersCount]);

    return null;
};
