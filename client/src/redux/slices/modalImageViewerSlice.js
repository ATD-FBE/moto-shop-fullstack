import { createSlice } from '@reduxjs/toolkit';

const initialState = {
    isOpen: false,
    images: [],
    initialIndex: 0
  };

const modalImageViewerSlice = createSlice({
    name: 'modalImageViewer',
    initialState,
    reducers: {
        showImageViewerModal(state, action) {
            state.isOpen = true;
            state.images = action.payload.images || [];
            state.initialIndex = action.payload.initialIndex || 0;
        },

        hideImageViewerModal(state) {
            state.isOpen = false;
            state.images = [];
            state.initialIndex = 0;
        }
    }
});

export const { showImageViewerModal, hideImageViewerModal } = modalImageViewerSlice.actions;
export default modalImageViewerSlice.reducer;
