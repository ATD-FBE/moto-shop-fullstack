import AppStore from '@/redux/Store.jsx';
import { showConfirmModal, hideConfirmModal } from '@/redux/slices/modalConfirmSlice.js';

let confirmModalCallbacks = { // Передача функций, которые нельзя хранить в Redux
    onConfirm: null,
    onFinalize: null,
    onCancel: null,
    onClose: null,
};

export const openConfirmModal = ({
    openDelay = 0,
    dismissible,
    prompt,
    confirmBtnLabel,
    cancelBtnLabel,
    onConfirm,
    onFinalize,
    onCancel,
    onClose
}) => {
    setTimeout(() => {
        confirmModalCallbacks = { onConfirm, onCancel, onClose, onFinalize };
        AppStore.dispatch(showConfirmModal({ dismissible, prompt, confirmBtnLabel, cancelBtnLabel }));
    }, openDelay);
};

export const getConfirmModalCallbacks = () => {
    return confirmModalCallbacks;
};

export const closeConfirmModal = () => {
    confirmModalCallbacks = { onConfirm: null, onCancel: null, onClose: null, onFinalize: null };
    AppStore.dispatch(hideConfirmModal());
};
