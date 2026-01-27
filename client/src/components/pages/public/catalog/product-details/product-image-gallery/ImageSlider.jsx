import React, { useEffect, useRef } from 'react';
import cn from 'classnames';
import TrackedImage from '@/components/common/TrackedImage.jsx';

export default function ImageSlider({
    currentImageSrc,
    currentImageAlt,
    onPrev,
    onNext,
    onImageClick,
    uiBlocked
}) {
    const imageRef = useRef(null);

    useEffect(() => {
        const img = imageRef.current;
        if (!img) return;

        img.classList.remove('animate');
        void img.offsetWidth; // Форсировать пересчёт браузером состояния DOM
        img.classList.add('animate');
    }, [currentImageSrc]);

    return (
        <div className="image-slider">
            <button
                className="slide-btn slide-left"
                onClick={onPrev}
                disabled={uiBlocked}
                aria-label="Предыдущее изображение"
            >
                ⏴
            </button>

            <div className="current-thumb">
                <TrackedImage
                    ref={imageRef}
                    className={cn('current-thumb-img', { 'zoomable': !uiBlocked })}
                    src={currentImageSrc}
                    alt={currentImageAlt}
                    onClick={uiBlocked ? undefined : onImageClick}
                    aria-label="Просмотр изображения в масштабе"
                />
            </div>

            <button
                className="slide-btn slide-right"
                onClick={onNext}
                disabled={uiBlocked}
                aria-label="Следующее изображение"
            >
                ⏵
            </button>
        </div>
    );
};
