import AppStore from '@/redux/Store.jsx';
import { showAlertModal, hideAlertModal } from '@/redux/slices/modalAlertSlice.js';

let alertModalCallbacks = { onClose: null }; // Передача функций, которые нельзя хранить в Redux

export const openAlertModal = ({
    openDelay = 0,
    type,
    dismissible,
    title,
    message,
    dismissBtnLabel,
    onClose
}) => {
    setTimeout(() => {
        alertModalCallbacks = { onClose };
        AppStore.dispatch(showAlertModal({ type, dismissible, title, message, dismissBtnLabel }));
    }, openDelay);
};

export const getAlertModalCallbacks = () => {
    return alertModalCallbacks;
};

export const closeAlertModal = () => {
    alertModalCallbacks = { onClose: null };
    AppStore.dispatch(hideAlertModal());
};
