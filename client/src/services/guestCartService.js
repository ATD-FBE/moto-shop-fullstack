import { sendGuestCartItemListRequest } from '@/api/cartRequests.js';
import { setCartAccessibility } from '@/redux/slices/cartSlice.js';
import { applyCartState } from '@/services/cartService.js';
import { openAlertModal } from '@/services/modalAlertService.js';
import { logRequestStatus } from '@/helpers/requestLogger.js';
import { REQUEST_STATUS } from '@shared/constants.js';

export const saveGuestCartToLocalStorage = (cartItemList) => {
    if (!cartItemList) return;
    localStorage.setItem('guestCart', JSON.stringify(cartItemList));
};

export const loadGuestCartFromLocalStorage = () => {
    try {
        const guestCartData = localStorage.getItem('guestCart');
        return guestCartData ? JSON.parse(guestCartData) : [];
    } catch (err) {
        console.error('Ошибка при парсинге локальной корзины:', err);
        return [];
    }
};

export const removeGuestCartFromLocalStorage = () => {
    localStorage.removeItem('guestCart');
};

export const prepareGuestCartPayload = () => {
    const guestCartItemList = loadGuestCartFromLocalStorage();
    return guestCartItemList.map(({ id, quantity }) => ({ id, quantity }));
};

export const syncGuestCart = () => async (dispatch) => {
    const guestCart = prepareGuestCartPayload();
    if (!guestCart.length) return;

    const responseData = await dispatch(sendGuestCartItemListRequest(guestCart));
    const { status, message, purchaseProductList, cartItemList } = responseData;

    logRequestStatus({ context: 'CART: LOAD GUEST', status, message });

    if (status !== REQUEST_STATUS.SUCCESS) {
        dispatch(setCartAccessibility(false));
        openAlertModal({
            type: 'error',
            dismissible: false,
            title: 'Ошибка синхронизации корзины',
            message: 'Гостевая корзина временно недоступна.'
        });
        return;
    }

    dispatch(applyCartState(purchaseProductList, cartItemList));
};
