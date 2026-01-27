import { createSlice } from '@reduxjs/toolkit';

const initialState = {
    isOpen: false,
    dismissible: true,
    prompt: '',
    confirmBtnLabel: '',
    cancelBtnLabel: ''
};

const modalConfirmSlice = createSlice({
    name: 'modalConfirm',
    initialState,
    reducers: {
        showConfirmModal: (state, action) => {
            return { ...state, ...action.payload, isOpen: true };
        },

        hideConfirmModal: () => {
            return initialState;
        }
    }
});

export const { showConfirmModal, hideConfirmModal } = modalConfirmSlice.actions;

export default modalConfirmSlice.reducer;
