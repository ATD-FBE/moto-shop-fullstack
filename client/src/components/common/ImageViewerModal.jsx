import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useSelector } from 'react-redux';
import cn from 'classnames';
import TrackedImage from '@/components/common/TrackedImage.jsx';
import useSyncedStateWithRef from '@/hooks/useSyncedStateWithRef.js';
import { closeImageViewerModal, getImageViewerCallbacks } from '@/services/modalImageViewerService.js';

const modalPortalRoot = document.getElementById('modal-root') || document.body;

export default function ImageViewerModal() {
    const { isOpen, images, initialIndex } = useSelector(state => state.modalImageViewer);
    const [currentIdx, setCurrentIdx, currentIdxRef] = useSyncedStateWithRef(initialIndex); // Индекс
    const [isVisible, setIsVisible, isVisibleRef] = useSyncedStateWithRef(false); // Анимация
    const [isZoomable, setIsZoomable] = useState(false); // Масштабируемость картинки
    const [isZoomed, setIsZoomed] = useState(false); // Увеличение картинки при масштабируемости
    const [clickCoords, setClickCoords] = useState(null);
    const modalRef = useRef(null);
    const imageWrapperRef = useRef(null);
    const mainImageRef = useRef(null);
    const thumbsContainerScrollRef = useRef(null);
    const currentThumbRef = useRef(null);

    const handleClose = (e) => {
        e?.stopPropagation();

        if (isVisible) {
            setIsVisible(false);
        } else { // Анимация открытия модалки не успела начаться
            closeImageViewerModal();
        }
    };

    const goToPrev = (e) => {
        e?.stopPropagation();
        setCurrentIdx(prevIdx => (prevIdx - 1 + images.length) % images.length);
        setIsZoomed(false);
    };
    
    const goToNext = (e) => {
        e?.stopPropagation();
        setCurrentIdx(prevIdx => (prevIdx + 1) % images.length);
        setIsZoomed(false);
    };

    const selectThumbImage = (e, idx) => {
        e.stopPropagation();
        setCurrentIdx(idx);
        setIsZoomed(false);
    };

    const zoomImage = (e) => {
        e.stopPropagation();
        if (!isZoomable) return;

        const willZoomIn = !isZoomed;

        if (willZoomIn) { // Сохранение координат указателя мыши на картинке
            const imgContainer = imageWrapperRef.current.parentElement;

            const imgContainerRect = imgContainer.getBoundingClientRect();
            const offsetX = e.clientX - imgContainerRect.left + imgContainer.scrollLeft;
            const offsetY = e.clientY - imgContainerRect.top + imgContainer.scrollTop;

            setClickCoords({ x: offsetX, y: offsetY });
        } else { // Очистка координат указателя мыши
            setClickCoords(null);
        }

        setIsZoomed(willZoomIn);
    };
    
    // Отложенный сеттер включения анимации при открытии окна
    useEffect(() => {
        if (isOpen) {
            setCurrentIdx(initialIndex);
            requestAnimationFrame(() => setIsVisible(true));
        } else { // Сброс при закрытии вьювера
            setCurrentIdx(0);
            setIsZoomable(false);
            setIsZoomed(false);
            setClickCoords(null);
        }
    }, [isOpen, initialIndex]);

    // Вызовы опциональных коллбэков и очистка после анимации закрытия окна
    useEffect(() => {
        if (!isOpen) return;

        const modal = modalRef.current;
        if (!modal) return;
    
        const onTransitionEnd = (e) => {
            if (e.propertyName === 'opacity' && !isVisibleRef.current) {
                const { onClose } = getImageViewerCallbacks();
                onClose?.(currentIdxRef.current);
                closeImageViewerModal();
            }
        };
    
        modal.addEventListener('transitionend', onTransitionEnd);
        return () => modal.removeEventListener('transitionend', onTransitionEnd);
    }, [isOpen]);

    // Запрет скролла на документе при просмотре картинок
    useEffect(() => {
        document.body.style.overflow = isOpen ? 'hidden' : '';
        return () => document.body.style.overflow = '';
    }, [isOpen]);

    // Установка флага масштабирования картинки
    useEffect(() => {
        if (!isOpen) return;
    
        const img = mainImageRef.current;
        if (!img) return;
    
        const checkZoomability = () => {
            const imgWrapper = imageWrapperRef.current;
            if (!imgWrapper || !img || img.naturalWidth === 0) return;
    
            const { clientWidth: wrapperWidth, clientHeight: wrapperHeight } = imgWrapper;
            const { naturalWidth, naturalHeight } = img;
    
            const canZoom = naturalWidth > wrapperWidth || naturalHeight > wrapperHeight;
            setIsZoomable(canZoom);
            if (!canZoom) setIsZoomed(false);
        };
    
        // Если картинка уже в кеше и загружена => проверка зума
        if (img.complete && img.naturalWidth > 0) {
            checkZoomability();
        }
    
        // Установка слушателей в любом случае, так как src может измениться
        img.addEventListener('load', checkZoomability);
        window.addEventListener('resize', checkZoomability);
    
        return () => {
            img.removeEventListener('load', checkZoomability);
            window.removeEventListener('resize', checkZoomability);
        };
    }, [isOpen, images, currentIdx]);

    // Прокрутка к текущему превью в контейнере при изменении currentIdx
    useEffect(() => {
        const thumbsContainer = thumbsContainerScrollRef.current;
        const thumb = currentThumbRef.current;
        if (!thumbsContainer || !thumb) return;

        const offsetY = thumb.offsetTop - thumbsContainer.offsetTop;
        const scrollY = offsetY - thumbsContainer.clientHeight / 2 + thumb.clientHeight / 2;

        thumbsContainer.scrollTo({
            top: scrollY,
            behavior: 'smooth'
        });
    }, [currentIdx]);

    // Подключение и очистка слушателей кнопок
    useEffect(() => {
        if (!isVisible) return;

        const handleKeyDown = (e) => {
            if (e.key === 'Escape') handleClose();
            else if (e.key === 'ArrowLeft') goToPrev();
            else if (e.key === 'ArrowRight') goToNext();
        };
    
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [isVisible]);

    // Прокрутка изображения к координатам указателя мыши при масштабировании
    useEffect(() => {
        if (!isZoomed || !imageWrapperRef.current || !clickCoords) return;
    
        const imgContainer = imageWrapperRef.current.parentElement;
        const content = imageWrapperRef.current;
    
        const scaleFactorX = content.scrollWidth / imgContainer.clientWidth;
        const scaleFactorY = content.scrollHeight / imgContainer.clientHeight;
    
        const scrollLeft = clickCoords.x * scaleFactorX - imgContainer.clientWidth / 2;
        const scrollTop = clickCoords.y * scaleFactorY - imgContainer.clientHeight / 2;
    
        imgContainer.scrollTo({
            left: scrollLeft,
            top: scrollTop,
            behavior: 'auto'
        });
    }, [isZoomed, clickCoords]);

    if (!isOpen || !images.length) return null;

    return createPortal(
        <div
            ref={modalRef}
            className={cn('modal-backdrop-portal', { 'visible' : isVisible })}
        >
            <div className="image-viewer-modal" onClick={handleClose}>
                {/* Превью-контейнер */}
                <div className="thumbs-container">
                    <div ref={thumbsContainerScrollRef} className="thumbs-scroll">
                        {images.map((img, idx) => (
                            <button
                                key={idx}
                                ref={idx === currentIdx ? currentThumbRef : null}
                                className={cn('thumb-btn', { 'current': idx === currentIdx })}
                                onClick={(e) => selectThumbImage(e, idx)}
                                aria-label={`${img.title}, выбрать привью изображения номер ${idx + 1}`}
                            >
                                <TrackedImage
                                    className="thumb-img"
                                    src={img.url}
                                    alt={`${img.title} (миниатюра ${idx + 1})`}
                                />
                            </button>
                        ))}
                    </div>
                </div>

                {/* Основное изображение */}
                <div className="main-image-container">
                    <div
                        ref={imageWrapperRef}
                        className={cn('main-image-wrapper', { 'zoomed': isZoomed })}
                    >
                        <TrackedImage
                            ref={mainImageRef}
                            className={cn('main-image', { 'zoomable': isZoomable && !isZoomed })}
                            src={images[currentIdx].url}
                            alt={images[currentIdx].title}
                            onClick={zoomImage}
                            aria-label={isZoomable ? 'Масштабировать изображение' : undefined}
                        />
                    </div>
                </div>

                {/* Кнопка закрытия */}
                <button className="close-btn" onClick={handleClose} aria-label="Закрыть просмотр">
                    ❌
                </button>

                {/* Стрелки навигации */}
                <div className="nav-arrows">
                    <button onClick={goToPrev} aria-label="Предыдущее изображение">
                        <span className="icon">⏴</span>
                    </button>

                    <button onClick={goToNext} aria-label="Следующее изображение">
                        <span className="icon">⏵</span>
                    </button>
                </div>
            </div>
        </div>,

        modalPortalRoot
    );
};
