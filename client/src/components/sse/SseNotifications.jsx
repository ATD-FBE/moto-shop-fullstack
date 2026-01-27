import { useRef, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useLocation } from 'react-router-dom';
import { sendAuthSessionRequest } from '@/api/authRequests.js';
import { routeConfig } from '@/config/appRouting.js';
import { login, adjustUnreadNotificationsCount } from '@/redux/slices/authSlice.js';
import { adjustNewNotificationsCount } from '@/redux/slices/uiSlice.js';
import { saveUserToLocalStorage } from '@/services/authService.js';
import { prepareGuestCartPayload } from '@/services/guestCartService.js';
import { getSseUrl } from '@/helpers/sseHelpers.js';
import { logRequestStatus } from '@/helpers/requestLogger.js';
import { REQUEST_STATUS } from '@shared/constants.js';

const LOG_CTX = 'SSE: CUSTOMER NOTIFICATION';

export default function SseNotifications() {
    const unreadNotificationsCount = useSelector(state =>
        state.auth.user?.unreadNotificationsCount ?? 0
    );

    const location = useLocation();
    const dispatch = useDispatch();

    const locationPathRef = useRef(location.pathname);
    const unreadNotificationsCountRef = useRef(unreadNotificationsCount);
    const wasSseErrorRef = useRef(false);

    const syncAfterReconnect = async () => {
        const guestCart = prepareGuestCartPayload();
        const responseData = await dispatch(sendAuthSessionRequest(guestCart));
        const { status, message, user: updatedUser, accessTokenExp, refreshTokenExp } = responseData;

        logRequestStatus({ context: LOG_CTX, status, message });
    
        if (status === REQUEST_STATUS.SUCCESS) {
            dispatch(login({ user: updatedUser, accessTokenExp, refreshTokenExp }));
            saveUserToLocalStorage(updatedUser);

            if (
                routeConfig.customerNotifications.paths.includes(locationPathRef.current) &&
                updatedUser.unreadNotificationsCount !== unreadNotificationsCountRef.current
            ) {
                dispatch(adjustNewNotificationsCount(
                    updatedUser.unreadNotificationsCount - unreadNotificationsCountRef.current
                ));
            }
        }
    };

    const adjustAndSyncUnreadNotificationsCount = (count) => (dispatch, getState) => {
        dispatch(adjustUnreadNotificationsCount(count)); // Обновляет user в сторе auth
        saveUserToLocalStorage(getState().auth.user); // Сохраняет обновлённого user локально
    };

    const applySseMessage = (data) => {
        const { newUnreadNotificationsCount } = data;

        if (newUnreadNotificationsCount) {
            dispatch(adjustAndSyncUnreadNotificationsCount(newUnreadNotificationsCount));

            if (
                newUnreadNotificationsCount > 0 &&
                routeConfig.customerNotifications.paths.includes(locationPathRef.current)
            ) {
                dispatch(adjustNewNotificationsCount(newUnreadNotificationsCount));
            }
        }
    };

    // Запуск SSE (один раз)
    useEffect(() => {
        const eventSource = new EventSource(getSseUrl('notifications'), { withCredentials: true });

        eventSource.onopen = async () => {
            logRequestStatus({
                context: LOG_CTX,
                status: REQUEST_STATUS.SUCCESS,
                message: 'SSE-соединение для уведомлений открыто'
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
                message: 'Ошибка соединения SSE для уведомлений'
            });
            wasSseErrorRef.current = true;
        };

        return () => {
            logRequestStatus({
                context: LOG_CTX,
                status: REQUEST_STATUS.SUCCESS,
                message: 'SSE-соединение для уведомлений закрыто'
            });
            eventSource.close();
        }
    }, []);

    // Обновление маршрута
    useEffect(() => {
        locationPathRef.current = location.pathname;
    }, [location.pathname]);

    // Обновление количества непрочитанных уведомлений
    useEffect(() => {
        unreadNotificationsCountRef.current = unreadNotificationsCount;
    }, [unreadNotificationsCount]);

    return null;
};
