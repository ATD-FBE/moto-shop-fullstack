import { updateCustomerDiscount } from '@/redux/slices/authSlice.js';
import { setCart, upsertCartItem, removeCartItem, updateCartTotals } from '@/redux/slices/cartSlice.js';
import { upsertProductsInStore } from '@/redux/slices/productsSlice.js';
import { saveGuestCartToLocalStorage } from '@/services/guestCartService.js';
import { calculateCartTotals } from '@shared/calculations.js';

export const setCartItem = (cartItem, isGuestCart = false) => (dispatch, getState) => {
    dispatch(upsertCartItem(cartItem));
    if (isGuestCart) saveGuestCart(getState().cart);
};

export const unsetCartItem = (productId, isGuestCart = false) => (dispatch, getState) => {
    dispatch(removeCartItem(productId));
    if (isGuestCart) saveGuestCart(getState().cart);
};

export const refreshCartTotals = () => (dispatch, getState) => {
    const state = getState();
    const cartItemList = state.cart.ids.map(id => state.cart.byId[id]);
    const productMap = state.products.byId;
    const customerDiscount = state.auth.user?.discount ?? 0;

    const cartProductData = buildCartProductData(cartItemList, productMap);
    const { rawTotal, discountedTotal } = calculateCartTotals(cartProductData, customerDiscount);

    dispatch(updateCartTotals({ rawTotal, discountedTotal }));
};

export const applyCartState = (purchaseProductList, cartItemList, customerDiscount = 0) =>
    (dispatch) => {
        dispatch(upsertProductsInStore(purchaseProductList)); // До обновления сумм!
        dispatch(setCart(cartItemList)); // До обновления сумм!
        dispatch(updateCustomerDiscount(customerDiscount)); // До обновления сумм!
        dispatch(refreshCartTotals());
    };

export const reconcileCartWithProducts = (productList) => (dispatch, getState) => {
    const state = getState();
    const cartItemList = state.cart.ids.map(id => state.cart.byId[id]);
    const isGuestCart = !state.auth.isAuthenticated;
    const oldProductMap = state.products.byId;
    const newProductMap = new Map(productList.map(prod => [prod.id, prod]));
    let shouldUpdateCart = false;
    let shouldRefreshTotals = false;

    let updatedCartItemList = cartItemList.map(cartItem => {
        const newProduct = newProductMap.get(cartItem.id);
        if (!newProduct) return cartItem;

        // Проверка доступности количества и соответствия флагов товаров в корзине
        let updatedCartItem = null;

        if (isGuestCart) {
            if (!newProduct.isActive) {
                updatedCartItem = { guestDeleted: true };
                shouldRefreshTotals = true;
            } else if (newProduct.available < cartItem.quantity) {
                if (newProduct.available > 0) {
                    updatedCartItem = { ...cartItem, quantity: newProduct.available };
                } else {
                    updatedCartItem = { guestDeleted: true };
                }
                
                shouldRefreshTotals = true;
            }
        } else {
            if (newProduct.available < cartItem.quantity) {
                if (newProduct.available > 0 && !cartItem.quantityReduced) {
                    updatedCartItem = { ...cartItem, quantityReduced: true };
                } else if (newProduct.available === 0 && !cartItem.outOfStock) {
                    updatedCartItem = { ...cartItem, quantityReduced: true, outOfStock: true };
                }
            } else if (cartItem.quantityReduced || cartItem.outOfStock) {
                updatedCartItem = { ...cartItem, quantityReduced: false, outOfStock: false };
            }
    
            if (
                (newProduct.isActive && cartItem.inactive) ||
                (!newProduct.isActive && !cartItem.inactive)
            ) {
                updatedCartItem = { ...(updatedCartItem || cartItem), inactive: !newProduct.isActive };
            }
    
            if (cartItem.deleted) {
                updatedCartItem = { ...(updatedCartItem || cartItem), deleted: false };
            }
        }

        if (updatedCartItem) shouldUpdateCart = true;

        // Проверка изменения цены или скидки
        const oldProduct = oldProductMap[cartItem.id];

        if (!shouldRefreshTotals) {
            if (oldProduct && (
                newProduct.price !== oldProduct.price ||
                newProduct.discount !== oldProduct.discount
            )) {
                shouldRefreshTotals = true;
            }
        }
    
        return updatedCartItem || cartItem;
    });

    dispatch(upsertProductsInStore(productList)); // До обновления сумм!
    if (shouldUpdateCart) {
        if (isGuestCart) updatedCartItemList = updatedCartItemList.filter(item => !item.guestDeleted);
        dispatch(setCart(updatedCartItemList)); // До обновления сумм!
        if (isGuestCart) saveGuestCartToLocalStorage(updatedCartItemList);
    }
    if (shouldRefreshTotals) dispatch(refreshCartTotals());
};

const saveGuestCart = (cartState) => {
    const cartItemList = cartState.ids.map(id => cartState.byId[id]);
    saveGuestCartToLocalStorage(cartItemList);
};

const buildCartProductData = (cartItemList, productMap) =>
    cartItemList
        .filter(cartItem => !cartItem.deleted)
        .map(cartItem => {
            const product = productMap[cartItem.id];

            return {
                price: product?.price ?? 0,
                discount: product?.discount ?? 0,
                quantity: cartItem.quantity
            };
        });
