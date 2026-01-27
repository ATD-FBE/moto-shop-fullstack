import AppStore from '@/redux/Store.jsx';
import { showImageViewerModal, hideImageViewerModal } from '@/redux/slices/modalImageViewerSlice.js';

let imageViewerModalCallbacks = { onClose: null }; // Передача функций, которые нельзя хранить в Redux

export const openImageViewerModal = ({ images, initialIndex, onClose }) => {
    imageViewerModalCallbacks = { onClose };
    AppStore.dispatch(showImageViewerModal({ images, initialIndex }));
};

export const getImageViewerCallbacks = () => {
    return imageViewerModalCallbacks;
};

export const closeImageViewerModal = () => {
    imageViewerModalCallbacks = { onClose: null };
    AppStore.dispatch(hideImageViewerModal());
};
