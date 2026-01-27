import { createSlice } from '@reduxjs/toolkit';

const initialState = {
    byId: {},
    ids: [],
    rawTotal: 0,
    discountedTotal: 0,
    isAccessible: true
};

const cartSlice = createSlice({
    name: 'cart',
    initialState,
    reducers: {
        setCartAccessibility: (state, action) => {
            state.isAccessible = action.payload;
        },

        setCart: (state, action) => {
            const cartItemList = action.payload;

            state.byId = Object.fromEntries(cartItemList.map(item => [item.id, item]));
            state.ids = cartItemList.map(item => item.id);
        },

        upsertCartItem: (state, action) => {
            const cartItem = action.payload;
            const { id, quantity } = cartItem;
            const isNew = !state.byId[id];

            if (isNew) {
                state.byId[id] = cartItem;
                state.ids.push(id);
            } else {
                state.byId[id].quantity = quantity; // quantity > 0 при upsertCartItem
                state.byId[id].quantityReduced = false;
            }
        },

        removeCartItem: (state, action) => {
            const productId = action.payload;

            delete state.byId[productId];
            state.ids = state.ids.filter(id => id !== productId);
        },

        updateCartTotals: (state, action) => {
            const { rawTotal, discountedTotal } = action.payload;

            state.rawTotal = rawTotal;
            state.discountedTotal = discountedTotal;
        },

        clearCart: (state) => {
            state.byId = {};
            state.ids = [];
            state.rawTotal = 0;
            state.discountedTotal = 0;
        }
    }
});

export const {
    setCartAccessibility,
    setCart,
    updateCartTotals,
    upsertCartItem,
    removeCartItem,
    clearCart
} = cartSlice.actions;

export default cartSlice.reducer;
