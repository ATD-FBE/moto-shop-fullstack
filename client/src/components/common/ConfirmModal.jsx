import React, { useState, useRef, useEffect } from 'react';
import { useSelector } from 'react-redux';
import { createPortal } from 'react-dom';
import parse from 'html-react-parser';
import cn from 'classnames';
import useSyncedStateWithRef from '@/hooks/useSyncedStateWithRef.js';
import { wasLastInputKeyboard } from '@/helpers/inputMethod.js';
import { getConfirmModalCallbacks, closeConfirmModal } from '@/services/modalConfirmService.js';
import { CLIENT_CONSTANTS } from '@shared/constants.js';

const { MODAL_ANIMATION_DURATION } = CLIENT_CONSTANTS;

const appRoot = document.getElementById('app');
const modalPortalRoot = document.getElementById('modal-root') || document.body;

export default function ConfirmModal() {
    const {
        isOpen,
        dismissible = true,
        prompt = '',
        confirmBtnLabel = 'Подтвердить',
        cancelBtnLabel = 'Отмена'
    } = useSelector(state => state.modalConfirm);

    const [isVisible, setIsVisible, isVisibleRef] = useSyncedStateWithRef(false); // Анимация
    const [isDisabled, setIsDisabled, isDisabledRef] = useSyncedStateWithRef(false);
    const [hasError, setHasError] = useState(false);
    const modalRef = useRef(null);
    const isFinalizeRef = useRef(false);
    const isClosingRef = useRef(false);
    const lastFocusedElemRef = useRef(null);
    const fallbackCloseTimer = useRef(null);

    const { onConfirm, onFinalize, onCancel, onClose } = getConfirmModalCallbacks();

    const handleConfirm = async () => {
        try {
            setIsDisabled(true);
            setHasError(false);
            await onConfirm?.();
            isFinalizeRef.current = true;
            isClosingRef.current = true;
            setIsVisible(false);
        } catch {
            setIsDisabled(false);
            setHasError(true);
        }
    };

    const clearFallbackCloseTimer = () => {
        clearTimeout(fallbackCloseTimer.current);
        fallbackCloseTimer.current = null;
    };

    const finalizeClose = () => {
        if (!isClosingRef.current) return;
        isClosingRef.current = false;

        clearFallbackCloseTimer();
        closeConfirmModal();

        if (isFinalizeRef.current) {
            isFinalizeRef.current = false;
            onFinalize?.();
        } else {
            onClose?.();
        }

        appRoot?.removeAttribute('inert');
        lastFocusedElemRef.current?.focus?.();
        lastFocusedElemRef.current = null;
    };
    
    const handleCancel = async () => {
        if (isDisabledRef.current) return;
        if (isClosingRef.current) return;

        try {
            setIsDisabled(true);
            await onCancel?.();
            isClosingRef.current = true;
            setIsVisible(false);

            // Фоллбэк для отмены через Escape, если анимация закрытия не началась
            fallbackCloseTimer.current = setTimeout(finalizeClose, MODAL_ANIMATION_DURATION + 30);
        } catch {
            setIsDisabled(false);
            setHasError(true);
        }
    };

    // Включение/отключение анимации при открытии/закрытии модального окна
    useEffect(() => {
        if (!isOpen) {
            return setIsVisible(false);
        }

        clearFallbackCloseTimer();
        appRoot?.setAttribute('inert', '');
        setIsDisabled(false);
        setHasError(false);
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

    // Сохранение активного элемента и фокус на кнопке отмены модалки, если ввод был через клавиатуру
    useEffect(() => {
        if (!isOpen) return;

        const modal = modalRef.current;
        if (!modal) return;
        if (!wasLastInputKeyboard()) return;
    
        lastFocusedElemRef.current = document.activeElement;
        modal.querySelector('button.cancel-btn:not([disabled])')?.focus();
    }, [isOpen]);

    // Закрытие модального окна через Escape
    useEffect(() => {
        if (!isVisible) return;
    
        const handleEscape = (e) => e.key === 'Escape' && handleCancel();
    
        document.addEventListener('keydown', handleEscape);
        return () => document.removeEventListener('keydown', handleEscape);
    }, [isVisible]);

    if (!isOpen && !isVisible) return null;
  
    return createPortal(
        <div
            ref={modalRef}
            className={cn('modal-backdrop-portal', { 'visible' : isVisible })}
            onClick={dismissible && !isDisabled ? handleCancel : undefined}
        >
            <div
                className="confirm-modal"
                role="dialog"
                aria-modal="true"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="prompt">
                    {prompt.split(/\r?\n/).map((paragraph, idx) =>
                        paragraph
                            ? (
                                <p key={`modal-prompt-${idx}`}>
                                    {idx === 0 && <span className="icon">⚠️</span>}
                                    {parse(paragraph)}
                                </p>
                            )
                            : <br key={`modal-prompt-${idx}`} />
                    )}
                </div>

                <p className="error-message">
                    {hasError ? '❌ Ошибка при выполнении действия' : ''}
                </p>

                <div className="buttons-box">
                    <button className="confirm-btn" onClick={handleConfirm} disabled={isDisabled}>
                        <span className="icon">✅</span>
                        {confirmBtnLabel}
                    </button>

                    <button className="cancel-btn" onClick={handleCancel} disabled={isDisabled}>
                        <span className="icon">❌</span>
                        {cancelBtnLabel}
                    </button>
                </div>
            </div>
        </div>,
        
        modalPortalRoot
    );
};
