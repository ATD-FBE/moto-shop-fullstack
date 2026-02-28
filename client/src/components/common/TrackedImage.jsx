import React, { forwardRef, useEffect } from 'react';
import useImageTracking from '@/hooks/useImageTracking.js';

const TrackedImage = forwardRef((props, ref) => {
    const { onLoad, onError, ...restProps } = props;

    // Получение функций хука отслеживания загрузки картинки
    const { startTracking, completeTracking } = useImageTracking();

    const handleLoad = (e) => {
        completeTracking(); // Завершение отслеживания загрузки картинки после загрузки
        onLoad?.(e); // Вызов передаваемой функции для загрузки
    };

    const handleError = (e) => {
        completeTracking(); // Завершение отслеживания загрузки картинки после ошибки
        onError?.(e); // Вызов передаваемой функции для ошибки
    };

    // Запуск отслеживания загрузки картинки
    useEffect(() => {
        startTracking();
    }, [startTracking]);

    return (
        <img
            {...restProps}
            ref={ref}
            onLoad={handleLoad}
            onError={handleError}
            decode="async"
        />
    );
});

export default TrackedImage;
