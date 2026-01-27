import React, { useState, useRef, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { createPortal } from 'react-dom';
import parse from 'html-react-parser';
import cn from 'classnames';
import useSyncedStateWithRef from '@/hooks/useSyncedStateWithRef.js';
import { wasLastInputKeyboard } from '@/helpers/inputMethod.js';
import { getAlertModalCallbacks, closeAlertModal } from '@/services/modalAlertService.js';
import { CLIENT_CONSTANTS } from '@shared/constants.js';

const { MODAL_ANIMATION_DURATION } = CLIENT_CONSTANTS;

const alertIconByType = {
    info: '❕',
    warning: '⚠️',
    error: '❌'
};

const appRoot = document.getElementById('app');
const modalPortalRoot = document.getElementById('modal-root') || document.body;

export default function AlertModal() {
    const {
        isOpen,
        type = 'info', // 'info', 'warning', 'error'
        dismissible = true,
        title = '',
        message = '',
        dismissBtnLabel = 'OK'
    } = useSelector(state => state.modalAlert);

    const [isVisible, setIsVisible, isVisibleRef] = useSyncedStateWithRef(false); // Анимация
    const [isDisabled, setIsDisabled] = useState(false);
    const modalRef = useRef(null);
    const isClosingRef = useRef(false);
    const lastFocusedElemRef = useRef(null);
    const fallbackCloseTimer = useRef(null);

    const { onClose } = getAlertModalCallbacks();

    const clearFallbackCloseTimer = () => {
        clearTimeout(fallbackCloseTimer.current);
        fallbackCloseTimer.current = null;
    };

    const finalizeClose = () => {
        if (!isClosingRef.current) return;
        isClosingRef.current = false;

        clearFallbackCloseTimer();
        closeAlertModal();
        onClose?.();

        appRoot?.removeAttribute('inert');
        lastFocusedElemRef.current?.focus?.();
        lastFocusedElemRef.current = null;
    };
    
    const handleClose = () => {
        if (isClosingRef.current) return;
        isClosingRef.current = true;

        setIsDisabled(true);
        setIsVisible(false);

        // Фоллбэк для отмены через Escape, если анимация закрытия не началась
        fallbackCloseTimer.current = setTimeout(finalizeClose, MODAL_ANIMATION_DURATION + 30);
    };

    // Включение/отключение анимации при открытии/закрытии модального окна
    useEffect(() => {
        if (!isOpen) {
            return setIsVisible(false);
        }

        clearFallbackCloseTimer();
        appRoot?.setAttribute('inert', '');
        setIsDisabled(false);
        setIsVisible(true);
    }, [isOpen]);

    // Вызовы опциональных коллбэков и очистка после анимации закрытия окна
    useEffect(() => {
        if (!isOpen) return;

        const modal = modalRef.current;
        if (!modal) return;
    
        const onTransitionEnd = (e) => {
            if (e.target === modal && e.propertyName === 'opacity' && !isVisibleRef.current) {
                finalizeClose();
            }
        };
    
        modal.addEventListener('transitionend', onTransitionEnd);
        return () => modal.removeEventListener('transitionend', onTransitionEnd);
    }, [isOpen]);

    // Сохранение активного элемента и фокус на кнопке модалки, если ввод был через клавиатуру
    useEffect(() => {
        if (!isOpen) return;

        const modal = modalRef.current;
        if (!modal) return;
        if (!wasLastInputKeyboard()) return;
    
        lastFocusedElemRef.current = document.activeElement;
        modal.querySelector('button.dismiss-btn:not([disabled])')?.focus();
    }, [isOpen]);

    // Закрытие модального окна через Escape
    useEffect(() => {
        if (!isVisible) return;
    
        const handleEscape = (e) => e.key === 'Escape' && handleClose();
    
        document.addEventListener('keydown', handleEscape);
        return () => document.removeEventListener('keydown', handleEscape);
    }, [isVisible]);

    if (!isOpen && !isVisible) return null;
  
    return createPortal(
        <div
            ref={modalRef}
            className={cn('modal-backdrop-portal', { 'visible' : isVisible })}
            onClick={dismissible ? handleClose : undefined}
        >
            <div
                className={cn('alert-modal', type)}
                role="dialog"
                aria-modal="true"
                onClick={(e) => e.stopPropagation()}
            >
                <h3 className="title">
                    <span className="icon">{alertIconByType[type]}</span>
                    {title}
                </h3>

                <div className="message">
                    {message.split(/\r?\n/).map((paragraph, idx) =>
                        paragraph
                            ? <p key={`modal-message-${idx}`}>{parse(paragraph)}</p>
                            : <br key={`modal-message-${idx}`} />
                    )}
                </div>

                <div className="button-box">
                    <button className="dismiss-btn" onClick={handleClose} disabled={isDisabled}>
                        <span className="icon">✅</span>
                        {dismissBtnLabel}
                    </button>
                </div>
            </div>
        </div>,
        
        modalPortalRoot
    );
};
