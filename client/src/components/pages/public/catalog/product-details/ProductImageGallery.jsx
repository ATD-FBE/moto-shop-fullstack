import React, { useState, useRef, useEffect } from 'react';
import ImageSlider from './product-image-gallery/ImageSlider.jsx';
import ImageThumbnails from './product-image-gallery/ImageThumbnails.jsx';
import { openImageViewerModal } from '@/services/modalImageViewerService.js';
import { CLIENT_CONSTANTS } from '@shared/constants.js';

const {
    DATA_LOAD_STATUS,
    PRODUCT_IMAGE_LOADER,
    PRODUCT_IMAGE_PLACEHOLDER,
    PRODUCT_AUTOSLIDE_TIMER
} = CLIENT_CONSTANTS;

export default function ProductImageGallery({
    loadStatus,
    images,
    mainImageIndex,
    title,
    reloadData
}) {
    const [currentThumbIdx, setCurrentThumbIdx] = useState(mainImageIndex);
    const sliderTimerRef = useRef(null);

    const isReady = loadStatus === DATA_LOAD_STATUS.READY;
    const hasProductImage = isReady && images.length > 0;

    const currentImageSrc = isReady
        ? images[currentThumbIdx]?.original ?? PRODUCT_IMAGE_PLACEHOLDER
        : PRODUCT_IMAGE_LOADER;
    const currentImageAlt = hasProductImage ? title : '';

    const startAutoSlide = () => {
        sliderTimerRef.current = setInterval(() => {
            setCurrentThumbIdx(prev => (prev + 1) % images.length);
        }, PRODUCT_AUTOSLIDE_TIMER);
    };

    const reStartAutoSlide = () => {
        clearInterval(sliderTimerRef.current);
        startAutoSlide();
    };

    const slideImagesBackward = () => {
        if (images.length <= 1) return;

        reStartAutoSlide();
        setCurrentThumbIdx(prev => (prev - 1 + images.length) % images.length);
    };

    const slideImagesForward = () => {
        if (images.length <= 1) return;

        reStartAutoSlide();
        setCurrentThumbIdx(prev => (prev + 1) % images.length);
    };

    const selectThumbImage = (idx) => {
        if (images.length <= 1) return;

        reStartAutoSlide();
        setCurrentThumbIdx(idx);
    };

    const handleSliderImageClick = () => {
        clearInterval(sliderTimerRef.current);

        openImageViewerModal({
            images: images.map(img => ({ url: img.original, title })),
            initialIndex: currentThumbIdx,
            ...(images.length > 1 && {
                onClose: (currentIdx) => {
                    setCurrentThumbIdx(currentIdx);
                    startAutoSlide();
                }
            })
        });
    };

    // Обновление главного индекса после загрузки товара
    useEffect(() => {
        setCurrentThumbIdx(mainImageIndex);
    }, [mainImageIndex]);

    // Старт таймера автопрокрутки слайдера и его очистка при размонтировании компонента
    useEffect(() => {
        if (images.length <= 1) return;

        startAutoSlide();
        return () => clearInterval(sliderTimerRef.current);
    }, [images]);

    return (
        <div className="product-image-gallery">
            <ImageSlider
                currentImageSrc={currentImageSrc}
                currentImageAlt={currentImageAlt}
                onNext={slideImagesForward}
                onPrev={slideImagesBackward}
                onImageClick={handleSliderImageClick}
                uiBlocked={!hasProductImage}
            />

            <ImageThumbnails
                loadStatus={loadStatus}
                images={images}
                currentIdx={currentThumbIdx}
                title={title}
                reloadData={reloadData}
                onSelect={selectThumbImage}
            />
        </div>
    );
};
