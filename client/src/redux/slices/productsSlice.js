import { createSlice } from '@reduxjs/toolkit';

const deepEqual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const initialState = {
    byId: {},
    ids: []
};

const productsSlice = createSlice({
    name: 'products',
    initialState,
    reducers: {
        upsertProductsInStore: (state, action) => {
            const products = action.payload;
        
            products.forEach(product => {
                const productId = product.id;
                const existingProduct = state.byId[productId];
        
                if (!existingProduct) {
                    state.byId[productId] = { ...product };
                    state.ids.push(productId);
                } else {
                    const isEqual = deepEqual(existingProduct, product);
                    if (!isEqual) state.byId[productId] = product;
                }
            });
        },

        removeProductsFromStore: (state, action) => {
            const productIds = action.payload;
            const productIdsSet = new Set(productIds);

            productIds.forEach(id => delete state.byId[id]);
            state.ids = state.ids.filter(id => !productIdsSet.has(id));
        },

        removePrivilegedFieldsFromProducts: (state) => {
            const privilegedFields = ['stock', 'reserved', 'category', 'tags'];
            
            state.ids.forEach(id => {
                const product = state.byId[id];
                if (!product) return;
                
                privilegedFields.forEach(field => delete product[field]);
            });
        },

        clearProductStore: (state) => {
            state.byId = {};
            state.ids = [];
        }
    }
});

export const {
    upsertProductsInStore,
    removeProductsFromStore,
    removePrivilegedFieldsFromProducts,
    clearProductStore
} = productsSlice.actions;

export default productsSlice.reducer;
