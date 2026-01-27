import { configureStore } from '@reduxjs/toolkit';
import authReducer from './slices/authSlice.js';
import uiReducer from './slices/uiSlice.js';
import loadingReducer from './slices/loadingSlice.js';
import modalAlertReducer from './slices/modalAlertSlice.js';
import modalConfirmReducer from './slices/modalConfirmSlice.js';
import modalImageViewerReducer from './slices/modalImageViewerSlice.js';
import productsReducer from './slices/productsSlice.js';
import cartReducer from './slices/cartSlice.js';

const AppStore = configureStore({
    reducer: {
        auth: authReducer, // const authState = useSelector(state => state.auth);
        ui: uiReducer, // const uiState = useSelector(state => state.ui);
        loading: loadingReducer, // const loadingState = useSelector(state => state.loading);
        modalAlert: modalAlertReducer, // const modalAlertState = useSelector(state => state.modalAlert);
        modalConfirm: modalConfirmReducer, // const modalConfirmState = useSelector(state => state.modalConfirm);
        modalImageViewer: modalImageViewerReducer, // const modalImageViewerState = useSelector(state => state.modalImageViewer);
        products: productsReducer, // const productsState = useSelector(state => state.products);
        cart: cartReducer // const cartState = useSelector(state => state.cart);
    }
});

export default AppStore;
