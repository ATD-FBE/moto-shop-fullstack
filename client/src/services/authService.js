import AppStore from '@/redux/Store.jsx';
import {
    sendAuthSessionRequest,
    sendAuthRefreshRequest,
    sendAuthLogoutRequest,
} from '@/api/authRequests.js';
import { login, logout, setAccessTokenExpiry } from '@/redux/slices/authSlice.js';
import { removePrivilegedFieldsFromProducts } from '@/redux/slices/productsSlice.js';
import { setCartAccessibility, setCart, clearCart } from '@/redux/slices/cartSlice.js';
import {
    setLockedRoute,
    clearLockedRoute,
    setSessionReady
} from '@/redux/slices/uiSlice.js';
import { syncGuestCart } from '@/services/guestCartService.js';
import { refreshCartTotals, applyCartState } from '@/services/cartService.js';
import {
    prepareGuestCartPayload,
    loadGuestCartFromLocalStorage,
    removeGuestCartFromLocalStorage
} from '@/services/guestCartService.js';
import { openAlertModal } from '@/services/modalAlertService.js';
import { routeConfig } from '@/config/appRouting.js';
import { logRequestStatus } from '@/helpers/requestLogger.js';
import { REQUEST_STATUS } from '@shared/constants.js';

export const saveUserToLocalStorage = (user) => {
    if (!user) return;
    localStorage.setItem('user', JSON.stringify(user));
};

export const removeUserFromLocalStorage = () => {
    localStorage.removeItem('user');
};

export const loadSession = () => async (dispatch) => {
    const localUserData = localStorage.getItem('user');
    
    // Нет локальных данных пользователя => загрузка и синхронизация гостевой корзины
    if (!localUserData) {
        await dispatch(syncGuestCart());
        dispatch(setSessionReady(true));
        return;
    }

    // Запрос данных сессии пользователя
    const guestCart = prepareGuestCartPayload();
    const responseData = await dispatch(sendAuthSessionRequest(guestCart));
    const {
        status, message, user, accessTokenExp, refreshTokenExp,
        purchaseProductList, cartItemList, cartWasMerged, orderDraftId
    } = responseData;

    logRequestStatus({ context: 'AUTH: SESSION', status, message });

    if (status === REQUEST_STATUS.SUCCESS) {
        dispatch(login({ user, accessTokenExp, refreshTokenExp }));

        if (user.role === 'customer') {
            dispatch(initCustomerSession({
                purchaseProductList,
                cartItemList,
                customerDiscount: user.discount,
                orderDraftId,
                cartWasMerged
            }));
        }

        dispatch(setSessionReady(true));
        return;
    }

    // Токены не валидны или пользователь не найден => разлогинивание и выход
    if ([REQUEST_STATUS.UNAUTH, REQUEST_STATUS.USER_GONE].includes(status)) {
        dispatch(setSessionReady(true));
        return;
    }

    // Нет соединения или ошибка сервера => загрузка локальных данных пользователя
    try {
        const localUser = JSON.parse(localUserData);

        logRequestStatus({
            context: 'AUTH: LOCAL USER',
            status: REQUEST_STATUS.SUCCESS,
            message: 'Загружены локальные данные пользователя'
        });

        dispatch(login({ isLocalSession: true, user: localUser }));
        dispatch(setCartAccessibility(false)); // Блокировака корзины

        delayAndShowAlert({
            type: 'error',
            dismissible: false,
            title: 'Ошибка сервера...',
            message:
                'Загружены локальные данные пользователя.\n' +
                'Добавление товаров, работа с корзиной и все функции, требующие авторизации, ' +
                'временно недоступны.'
        });
    } catch (err) {
        console.error('Ошибка при парсинге локальных данных пользователя:', err);
        dispatch(logout()); // Разлогинивание при ошибке парсинга локальных данных
    }

    dispatch(setSessionReady(true));
};

export const initCustomerSession = ({
    purchaseProductList,
    cartItemList,
    customerDiscount,
    orderDraftId,
    cartWasMerged,
    isFirstLogin = false
}) => async (dispatch) => {
    removeGuestCartFromLocalStorage();
    
    dispatch(applyCartState(purchaseProductList, cartItemList, customerDiscount));

    let redirectTo = null;

    if (orderDraftId) {
        const checkoutPath = routeConfig.customerCheckout.generatePath({ orderId: orderDraftId });
        redirectTo = checkoutPath;
        dispatch(setLockedRoute(checkoutPath));
    }
    
    if (cartWasMerged) {
        delayAndShowAlert({
            type: 'info',
            title: 'Обновление корзины товаров',
            message: 'Товары из гостевой корзины перенесены в корзину аккаунта.' +
                (!isFirstLogin
                    ? ' При совпадении товаров использовано количество из гостевой версии.'
                    : '')
        });
    }

    return { redirectTo };
};

const delayAndShowAlert = (alertOptions, delay = 1000) => {
    setTimeout(() => {
        const isAuthenticated = AppStore.getState().auth.isAuthenticated;
        if (isAuthenticated) openAlertModal(alertOptions);
    }, delay);
};

export const checkAuth = () => async (dispatch, getState) => {
    const { isLocalSession, accessTokenExpiresAt, refreshTokenExpiresAt } = getState().auth;
    if (isLocalSession) return;

    const now = new Date();

    // Проверка access token
    const isAccessTokenValid = now < accessTokenExpiresAt;
    if (isAccessTokenValid) return;

    // Access token просрочен — проверка refresh token
    const isRefreshTokenValid = now < refreshTokenExpiresAt;
    if (!isRefreshTokenValid) return await dispatch(handleLogout());

    // Refresh token валиден — обновление access token
    const { status, message, accessTokenExp } = await dispatch(sendAuthRefreshRequest());
    logRequestStatus({ context: 'AUTH: REFRESH', status, message });

    if (status === REQUEST_STATUS.SUCCESS) {
        dispatch(setAccessTokenExpiry(accessTokenExp));
    } else {
        await dispatch(handleLogout());
    }
};

export const handleLogout = ({ forceRedirectToLogin = false } = {}) => async (dispatch, getState) => {
    const userRole = getState().auth.user?.role ?? 'guest';
    const isPrivilegedUser = ['admin'].includes(userRole);
    
    // Запрос на удаление токенов, выход даже при ошибке
    const { status, message } = await dispatch(sendAuthLogoutRequest());
    logRequestStatus({ context: 'AUTH: LOGOUT', status, message });
    
    // Удаление данных пользователя
    removeUserFromLocalStorage();

    // Разлогинивание
    dispatch(logout(forceRedirectToLogin));

    // Очистка критических данных товаров в Redux при выходе привиллегированного пользователя
    if (isPrivilegedUser) dispatch(removePrivilegedFieldsFromProducts());

    // Установка гостевой корзины, если есть товары (при выходе админа), или очистка корзины аккаунта
    const guestCart = loadGuestCartFromLocalStorage();

    if (guestCart.length > 0) {
        dispatch(setCart(guestCart));
        dispatch(refreshCartTotals());
    } else {
        dispatch(clearCart());
    }

    // Восстановление доступности корзины
    dispatch(setCartAccessibility(true));

    // Очистка глобального заблокированного маршрута
    dispatch(clearLockedRoute());

    // Сигнал для выхода со всех вкладок браузера
    localStorage.setItem('auth:logout', String(Date.now()));
};
