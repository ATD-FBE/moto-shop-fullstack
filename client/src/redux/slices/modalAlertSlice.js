import { createSlice } from '@reduxjs/toolkit';

const initialState = {
    isOpen: false,
    type: '',
    dismissible: true,
    title: '',
    message: '',
    dismissBtnLabel: ''
};

const modalAlertSlice = createSlice({
    name: 'modalAlert',
    initialState,
    reducers: {
        showAlertModal: (state, action) => {
            return { ...state, ...action.payload, isOpen: true };
        },

        hideAlertModal: () => {
            return initialState;
        }
    }
});

export const { showAlertModal, hideAlertModal } = modalAlertSlice.actions;

export default modalAlertSlice.reducer;
